import Joi from 'joi';

import {
  CONTACT_LANGUAGES,
  CONTACT_TOPICS,
  type ContactLanguage,
  type ContactTopic,
} from './contactMessage.model.js';

/**
 * The whole of what a sender may submit. `status` and `notifiedAt` are absent by design and
 * `stripUnknown` removes them, so a crafted body cannot file a message already marked handled.
 */
export const submitContactMessageBodySchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().max(254).email({ tlds: { allow: false } }).required(),
  topic: Joi.string()
    .valid(...CONTACT_TOPICS)
    .required(),
  message: Joi.string().trim().min(10).max(2000).required(),
  language: Joi.string()
    .valid(...CONTACT_LANGUAGES)
    .default('he'),
});

export interface SubmitContactMessageBody {
  readonly name: string;
  readonly email: string;
  readonly topic: ContactTopic;
  readonly message: string;
  readonly language: ContactLanguage;
}
