# KovalCloud

> Plataforma SaaS B2B Multi-Tenant de comercio omnicanal y gestión operativa para restaurantes y dark kitchens, integrando pedidos conversacionales vía WhatsApp (Meta Cloud API / Baileys) con un Kitchen Display System (KDS) reactivo en tiempo real.

[![NestJS](https://img.shields.io/badge/Backend-NestJS%2011-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2015-336791?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/ORM-Prisma%205-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Docker](https://img.shields.io/badge/Infra-Docker%20Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📌 Problema & Propuesta de Valor

* **El Reto:** Los restaurantes tradicionales pierden hasta un 30% en márgenes por comisiones de plataformas de terceros, o colapsan sus líneas de atención al transcribir manualmente pedidos no estructurados desde chats de WhatsApp, lo que provoca errores de despacho, demoras en cocina y pérdida de clientes.
* **La Solución:** **KovalCloud** automatiza la captura y gestión del pedido de extremo a extremo:
  1. El cliente pide por lenguaje natural en WhatsApp o a través de una carta web responsiva sin descargas.
  2. Un motor de NLU resuelve dudas, consulta disponibilidad y precios en tiempo real, y genera la orden.
  3. La cocina recibe la comanda al instante mediante WebSockets y alertas sonoras nativas en un panel KDS.
  4. Los cambios de estado de preparación notifican al comensal automáticamente por WhatsApp.

---

## 🏗️ Arquitectura del Sistema

El sistema implementa una arquitectura desacoplada basada en microservicios y contenedores: