import { Schema, model, type HydratedDocument } from 'mongoose';
export type UserRole = 'viewer' | 'operator' | 'admin';
export interface UserDocument {
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  // Bumped whenever a token should stop working before its natural expiry: logout,
  // deactivation, or a role change. authenticate() checks this against the token's
  // own copy on every request, so revocation takes effect immediately instead of
  // waiting out the token's TTL. See review 1.6.
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}
const schema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['viewer', 'operator', 'admin'], required: true, default: 'viewer' },
    active: { type: Boolean, default: true },
    tokenVersion: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);
export type UserHydratedDocument = HydratedDocument<UserDocument>;
export const UserModel = model<UserDocument>('User', schema);
export function toUserDTO(user: UserHydratedDocument) {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt.toISOString()
  };
}
