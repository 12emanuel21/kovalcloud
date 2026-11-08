/**
 * Cola en serie por conversación: los mensajes de un mismo chat se procesan de a uno y en orden.
 * Si el cliente manda 3 o 4 mensajes seguidos, cada uno se atiende cuando terminó el anterior
 * (ya con su respuesta en el historial): sin respuestas encimadas, sin leer un historial a medias
 * y sin registrar dos veces el mismo pedido. Chats distintos siguen en paralelo.
 *
 * Vive en memoria: alcanza con una sola instancia del backend (el despliegue actual).
 */
export class ChatQueue {
  private readonly tails = new Map<string, Promise<void>>();

  run(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    // Un error en un mensaje no bloquea los siguientes del mismo chat
    const current = previous.catch(() => undefined).then(task);
    const tail = current.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return current;
  }

  /** Chats con mensajes en proceso o en espera (diagnóstico / tests) */
  get size(): number {
    return this.tails.size;
  }
}
