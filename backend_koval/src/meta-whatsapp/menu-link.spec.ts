import { isHttpUrl, menuLinkReply, menuWebUrl, withMenuLink } from './menu-link';

describe('menu-link (carta web en vivo)', () => {
  afterEach(() => delete process.env.FRONTEND_URL);

  it('usa el slug y FRONTEND_URL (sin doble barra)', () => {
    process.env.FRONTEND_URL = 'https://app.kovalcloud.com/';
    expect(menuWebUrl({ slug: 'betaniaexpress' })).toBe('https://app.kovalcloud.com/menu/betaniaexpress');
    delete process.env.FRONTEND_URL;
    expect(menuWebUrl({ slug: 'betaniaexpress' })).toBe('https://kovalcloud.com/menu/betaniaexpress');
  });

  it('agrega el enlace una sola vez y destaca fotos, disponibilidad y pedido', () => {
    const url = 'https://kovalcloud.com/menu/x';
    expect(withMenuLink('Te comparto la carta.', url)).toBe(`Te comparto la carta.\n\n📲 Carta en vivo: ${url}`);
    expect(withMenuLink(`Mírala aquí: ${url}`, url)).toBe(`Mírala aquí: ${url}`);
    expect(menuLinkReply(url)).toMatch(/fotos.*disponibilidad en tiempo real.*armar tu pedido/);
  });

  it('solo acepta URLs http(s) como PDF configurado', () => {
    expect(isHttpUrl('https://cdn.local/carta.pdf')).toBe(true);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
    expect(isHttpUrl('carta.pdf')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });
});
