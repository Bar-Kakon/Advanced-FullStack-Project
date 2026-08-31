import type { Types } from 'mongoose';

import {
  ContactMessageModel,
  type ContactLanguage,
  type ContactMessageRecord,
  type ContactTopic,
} from './contactMessage.model.js';

export interface NewContactMessage {
  readonly name: string;
  readonly email: string;
  readonly topic: ContactTopic;
  readonly message: string;
  readonly language: ContactLanguage;
}

export interface ContactMessageRepository {
  create(message: NewContactMessage): Promise<ContactMessageRecord>;
  markNotified(id: Types.ObjectId, at: Date): Promise<void>;
}

export const contactMessageRepository: ContactMessageRepository = {
  async create(message) {
    const [created] = await ContactMessageModel.create([message]);
    return created!.toObject<ContactMessageRecord>();
  },

  async markNotified(id, at) {
    await ContactMessageModel.updateOne({ _id: id }, { $set: { notifiedAt: at } }).exec();
  },
};
