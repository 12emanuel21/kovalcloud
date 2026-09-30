
const fs = require('fs');
const path = '/home/evargas/dev/kovalcloud/frontend_koval/src/components/cart/CartDrawer.tsx';

let content = fs.readFileSync(path, 'utf8');

// The string was previously corrupted by powershell escaping, so it might contain ?? or garbage.
// We will replace the entire whatsappMessage block.
const blockStart = 'const whatsappMessage = `';
const blockEnd = '`;';

const startIndex = content.indexOf(blockStart);
const endIndex = content.indexOf(blockEnd, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    const originalBlock = content.substring(startIndex, endIndex + blockEnd.length);
    
    const newBlock = `const whatsappMessage = \`👋 ¡Hola! Acabo de hacer un pedido desde el menú digital de *\${restaurantName}*:

🧾 *Orden:* #\${orderShortId}
👤 *Cliente:* \${customerName.trim()}
📞 *Teléfono:* \${customerPhone.trim()}
\${tableNumber ? \`📍 *Mesa:* \${tableNumber} (Consumo en Local)\` : \`📍 *Dirección:* \${deliveryAddress.trim() || 'Para recoger / No especificada'}\`}

🛒 *Detalle del Pedido:*
\${itemsDetail}

💰 *Total a Pagar:* \${formatCOP(totalAmount)}
📝 *Notas:* \${notes.trim() || 'Ninguna'}\`;`;

    content = content.replace(originalBlock, newBlock);
    
    fs.writeFileSync(path, content, 'utf8');
    console.log("Emojis fixed in CartDrawer.tsx");
} else {
    console.log("Could not find whatsappMessage block");
}
