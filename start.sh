#!/bin/bash
set -e

# Colores para salida de terminal
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # Sin color

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}       🚀 INICIANDO ECOSISTEMA KOVAL CLOUD          ${NC}"
echo -e "${CYAN}====================================================${NC}"

# Verificar Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker no está instalado o no se encuentra en el PATH.${NC}"
    exit 1
fi

echo -e "\n${YELLOW}🛑 Deteniendo procesos conflictivos (por si acaso)...${NC}"
# Matar nest start (puerto 4000) o npm run dev local
pkill -f "nest start" || true
pkill -f "next" || true

# Detener contenedores previos
echo -e "\n${YELLOW}🧹 Limpiando contenedores anteriores...${NC}"
docker compose down

echo -e "\n${YELLOW}📦 Levantando ecosistema de 5 contenedores...${NC}"
echo -e "  - Postgres, NestJS, Baileys, Next.js, Nginx"
docker compose up -d --build

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}  ✅ ECOSISTEMA DOCKER LEVANTADO EXITOSAMENTE       ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "🔹 ${CYAN}Frontend App (Nginx):${NC} http://localhost"
echo -e "🔹 ${CYAN}NestJS Backend API:${NC}  http://localhost/api/"
echo -e "🔹 ${CYAN}PostgreSQL Database:${NC} localhost:5432"
echo -e "🔹 ${CYAN}Baileys WhatsApp:${NC}    http://localhost:5000"
echo -e "----------------------------------------------------"
echo -e "${YELLOW}ℹ️  Para ver el código QR de WhatsApp y logs de Baileys:${NC}"
echo -e "   ${CYAN}docker compose logs -f whatsapp_baileys${NC}"
echo -e "${YELLOW}ℹ️  Para ver todos los logs en tiempo real:${NC}"
echo -e "   ${CYAN}docker compose logs -f${NC}"
echo -e "${YELLOW}ℹ️  Para detener el ecosistema:${NC}"
echo -e "   ${CYAN}docker compose down${NC}"
echo -e "====================================================\n"
