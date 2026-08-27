import { Schema, model, type Types } from 'mongoose';

export type UserStatus = 'active' | 'deactivated' | 'banned' | 'deleted';
export type UserLanguage = 'he' | 'en';

/** The authentication identity. `passwordHash` is absent by default — see `UserWithPasswordHash`. */
export interface UserRecord {
  readonly _id: Types.ObjectId;
  readonly email: string;
  readonly status: UserStatus;
  readonly firstName: string;
  readonly lastName: string;
  readonly language: UserLanguage;
  readonly profileComplete: boolean;
}

export interface UserWithPasswordHash extends UserRecord {
  readonly passwordHash: string;
}

export const USER_STATUSES: readonly UserStatus[] = ['active', 'deactivated', 'banned', 'deleted'];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: USER_STATUSES, default: 'active', required: true, index: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    language: { type: String, enum: ['he', 'en'], default: 'he', required: true },
    profileComplete: { type: Boolean, default: false, required: true },
  },
  { timestamps: true },
);

export const UserModel = model('User', userSchema);
