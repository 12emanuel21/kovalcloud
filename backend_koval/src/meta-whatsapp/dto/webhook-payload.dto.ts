export interface MetaWebhookTextMessage {
  body: string;
}

export interface MetaWebhookMediaMessage {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

export interface MetaWebhookInteractiveReply {
  id: string;
  title: string;
  description?: string;
}

export interface MetaWebhookInteractiveMessage {
  type: 'button_reply' | 'list_reply';
  button_reply?: MetaWebhookInteractiveReply;
  list_reply?: MetaWebhookInteractiveReply;
}

export interface MetaWebhookButtonMessage {
  payload: string;
  text: string;
}

export interface MetaWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type:
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'interactive'
    | 'button'
    | 'location'
    | 'contacts'
    | 'sticker'
    | string;
  text?: MetaWebhookTextMessage;
  image?: MetaWebhookMediaMessage;
  video?: MetaWebhookMediaMessage;
  audio?: MetaWebhookMediaMessage;
  document?: MetaWebhookMediaMessage;
  interactive?: MetaWebhookInteractiveMessage;
  button?: MetaWebhookButtonMessage;
}

export interface MetaWebhookMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface MetaWebhookContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface MetaWebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin?: {
      type: string;
    };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
}

export interface MetaWebhookValue {
  messaging_product: string;
  metadata: MetaWebhookMetadata;
  contacts?: MetaWebhookContact[];
  messages?: MetaWebhookMessage[];
  statuses?: MetaWebhookStatus[];
}

export interface MetaWebhookChange {
  value: MetaWebhookValue;
  field: string;
}

export interface MetaWebhookEntry {
  id: string;
  changes: MetaWebhookChange[];
}

export class MetaWebhookPayloadDto {
  object: string;
  entry: MetaWebhookEntry[];
}
