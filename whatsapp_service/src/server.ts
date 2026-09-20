import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
  connectToWhatsApp,
  getWhatsAppStatus,
  getQRCode,
  getConnectedUser,
  sendWhatsAppMessage,
  logoutWhatsApp,
} from './whatsapp';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Endpoint de Salud y Estado con QR
app.get('/status', (req: Request, res: Response) => {
  const status = getWhatsAppStatus();
  const user = getConnectedUser();
  const qr = getQRCode();

  res.json({
    service: 'Koval WhatsApp Gateway',
    status,
    qr,
    user,
    timestamp: new Date().toISOString(),
  });
});

// Endpoint exclusivo para consultar el QR actual
app.get('/qr', (req: Request, res: Response) => {
  const qr = getQRCode();
  const status = getWhatsAppStatus();

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
app.post('/logout', async (req: Request, res: Response) => {
  try {
    await logoutWhatsApp();
    res.json({ success: true, message: 'Sesión de WhatsApp cerrada. Se reiniciará la conexión para generar un nuevo QR.' });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(500).json({ success: false, error: err.message || 'Error al cerrar sesión' });
  }
});

// Endpoint para forzar reconexión
app.post('/connect', async (req: Request, res: Response) => {
  try {
    await connectToWhatsApp();
    res.json({ success: true, status: getWhatsAppStatus() });
  } catch (error: unknown) {
    const err = error as { message?: string };
    res.status(500).json({ success: false, error: err.message || 'Error al conectar' });
  }
});

// Endpoint para envío de mensajes programáticos (acepta {to, text} o {phone, message})
app.post('/send', async (req: Request, res: Response): Promise<void> => {
  try {
    const target = req.body.to || req.body.phone;
    const content = req.body.text || req.body.message;

    if (!target || !content) {
      res.status(400).json({ error: 'Parámetros obligatorios: "to" (o "phone") y "text" (o "message")' });
      return;
    }

    const result = await sendWhatsAppMessage(target, content);
    res.json({ success: true, result });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.warn(`⚠️ No se pudo entregar mensaje a ${req.body.to || req.body.phone}:`, err.message);
    res.status(500).json({ success: false, error: err.message || 'Error al enviar mensaje' });
  }
});

// Iniciar servidor Express e inicializar conexión a WhatsApp
app.listen(PORT, async () => {
  console.log(`\n🚀 Microservicio WhatsApp corriendo en: http://localhost:${PORT}`);
  console.log(`📡 Conectando a Baileys WhatsApp Socket...\n`);
  try {
    await connectToWhatsApp();
  } catch (error) {
    console.error('Error al iniciar Baileys:', error);
  }
});
