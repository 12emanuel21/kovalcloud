import express, { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  connectToWhatsApp,
  getSessionInfo,
  isValidRestaurantId,
  listSessions,
  logoutWhatsApp,
  restoreSessions,
  sendWhatsAppMessage,
} from './whatsapp';

dotenv.config();

// Clave compartida con el backend. Sin ella el servicio no arranca (fail-closed).
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
if (!INTERNAL_API_KEY) {
  console.error('❌ Falta la variable de entorno INTERNAL_API_KEY. Abortando.');
  process.exit(1);
}
const expectedKey = Buffer.from(INTERNAL_API_KEY);

/** Exige x-api-key válido en todas las rutas (incluida /status, que expone el QR) */
function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const received = req.header('x-api-key');
  const receivedKey = Buffer.from(received || '');
  if (!received || receivedKey.length !== expectedKey.length || !timingSafeEqual(receivedKey, expectedKey)) {
    res.status(401).json({ success: false, error: 'No autorizado' });
    return;
  }
  next();
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(requireApiKey);
app.use(express.json({ limit: '50mb' }));

// Salud del servicio y resumen de sesiones activas
app.get('/status', (req: Request, res: Response) => {
  res.json({
    service: 'Koval WhatsApp Gateway',
    sessions: listSessions(),
    timestamp: new Date().toISOString(),
  });
});

// Todas las rutas de sesión llevan el restaurante en la URL: /sessions/:restaurantId/...
type SessionRequest = Request<{ restaurantId: string }>;
const sessions = express.Router({ mergeParams: true });

sessions.use((req: SessionRequest, res: Response, next: NextFunction) => {
  if (!isValidRestaurantId(req.params.restaurantId)) {
    res.status(400).json({ success: false, error: 'restaurantId inválido' });
    return;
  }
  next();
});

// Estado de la sesión del restaurante (incluye el QR si está pendiente de escaneo)
sessions.get('/status', (req: SessionRequest, res: Response) => {
  const { status, qr, user } = getSessionInfo(req.params.restaurantId);
  res.json({
    service: 'Koval WhatsApp Gateway',
    restaurantId: req.params.restaurantId,
    status,
    qr,
    user,
    timestamp: new Date().toISOString(),
  });
});

// Endpoint exclusivo para consultar el QR actual
sessions.get('/qr', (req: SessionRequest, res: Response) => {
  const { status, qr } = getSessionInfo(req.params.restaurantId);

  if (!qr && status === 'CONNECTED') {
    res.json({
      status,
      message: 'WhatsApp ya se encuentra conectado exitosamente.',
      qr: null,
    });
    return;
  }

  res.json({
    status,
    qr,
    message: qr ? 'Escanea el código QR para vincular la sesión.' : 'Generando código QR...',
  });
});

// Endpoint para cerrar sesión y generar nuevo QR
sessions.post('/logout', async (req: SessionRequest, res: Response) => {
  try {
    await logoutWhatsApp(req.params.restaurantId);
    res.json({ success: true, message: 'Sesión de WhatsApp cerrada. Se reiniciará la conexión para generar un nuevo QR.' });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(500).json({ success: false, error: err.message || 'Error al cerrar sesión' });
  }
});

// Endpoint para iniciar (o reutilizar) la sesión y generar el QR
sessions.post('/connect', async (req: SessionRequest, res: Response) => {
  try {
    const session = await connectToWhatsApp(req.params.restaurantId);
    res.json({ success: true, status: session.status });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(500).json({ success: false, error: err.message || 'Error al conectar' });
  }
});

// Endpoint para envío de mensajes programáticos.
// Texto: {to, text} o {phone, message}
// Documento: {to, document (Base64), filename?, mimetype?, caption?}
sessions.post('/send', async (req: SessionRequest, res: Response): Promise<void> => {
  try {
    const target = req.body.to || req.body.phone;
    const documentBase64: string | undefined = req.body.document;
    const content = req.body.text || req.body.message || req.body.caption || '';

    if (!target || (!content && !documentBase64)) {
      res.status(400).json({ error: 'Parámetros obligatorios: "to" (o "phone") y "text"/"message" o "document"' });
      return;
    }

    const document = documentBase64
      ? {
          buffer: Buffer.from(documentBase64, 'base64'),
          filename: req.body.filename || 'documento.pdf',
          mimetype: req.body.mimetype || 'application/pdf',
        }
      : undefined;

    const result = await sendWhatsAppMessage(req.params.restaurantId, target, content, document);
    res.json({ success: true, result });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.warn(`⚠️ [${req.params.restaurantId}] No se pudo entregar mensaje a ${req.body.to || req.body.phone}:`, err.message);
    res.status(500).json({ success: false, error: err.message || 'Error al enviar mensaje' });
  }
});

app.use('/sessions/:restaurantId', sessions);

// Iniciar servidor Express y restaurar las sesiones ya vinculadas
app.listen(PORT, async () => {
  console.log(`\n🚀 Microservicio WhatsApp (multi-tenant) corriendo en: http://localhost:${PORT}`);
  try {
    await restoreSessions();
  } catch (error) {
    console.error('Error restaurando sesiones de Baileys:', error);
  }
});
