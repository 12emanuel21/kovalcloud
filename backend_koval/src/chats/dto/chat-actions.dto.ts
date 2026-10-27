import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Mensaje manual del equipo al cliente (WhatsApp admite hasta 4096 caracteres) */
export class SendChatMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Escribe un mensaje' })
  @MaxLength(4096, { message: 'El mensaje no puede superar 4096 caracteres' })
  text: string;
}

/** Pausar (true) o reanudar (false) las respuestas automáticas del bot en una conversación */
export class SetHandoverDto {
  @IsBoolean()
  botPaused: boolean;
}
