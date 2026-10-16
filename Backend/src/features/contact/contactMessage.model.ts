import { Schema, model, type Types } from 'mongoose';

/** Storage codes, never labels: the client renders its own wording per language. */
export const CONTACT_TOPICS = ['general', 'support', 'partnership', 'other'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_MESSAGE_STATUSES = ['new', 'handled'] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

/** The two languages the product ships in, matching `users.language`. */
export const CONTACT_LANGUAGES = ['he', 'en'] as const;
export type ContactLanguage = (typeof CONTACT_LANGUAGES)[number];

export interface ContactMessageRecord {
  readonly _id: Types.ObjectId;
  readonly name: string;
  readonly email: string;
  readonly topic: ContactTopic;
  readonly message: string;
  readonly language: ContactLanguage;
  readonly status: ContactMessageStatus;
  readonly notifiedAt?: Date;
  readonly createdAt: Date;
}

const contactMessageSchema = new Schema(
  {
    // A sender is anonymous by definition: this arrives from a signed-out visitor, so there is no
    // account to reference and the name and address are the only identity the message carries.
    name: { type: String, trim: true, required: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, required: true, maxlength: 254 },

    topic: { type: String, enum: CONTACT_TOPICS, required: true },
    message: { type: String, trim: true, required: true, maxlength: 2000 },

    // Which language the form was in, so a reply is written in the one the sender used.
    language: { type: String, enum: CONTACT_LANGUAGES, required: true },

    status: { type: String, enum: CONTACT_MESSAGE_STATUSES, default: 'new', required: true },

    // Set only when the notification email really left the server. Absent means the message is
    // stored and nobody has been told, which is the honest state when SMTP is not configured.
    notifiedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The inbox: unhandled messages, newest first.
contactMessageSchema.index({ status: 1, createdAt: -1 });

export const ContactMessageModel = model('ContactMessage', contactMessageSchema);
