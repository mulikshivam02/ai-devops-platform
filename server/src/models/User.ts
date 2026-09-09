import { Schema, model, type HydratedDocument } from 'mongoose';
export type UserRole = 'viewer' | 'operator' | 'admin';
export interface UserDocument { email: string; passwordHash: string; role: UserRole; active: boolean; createdAt: Date; updatedAt: Date; }
const schema = new Schema<UserDocument>({ email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 }, passwordHash: { type: String, required: true }, role: { type: String, enum: ['viewer', 'operator', 'admin'], required: true, default: 'viewer' }, active: { type: Boolean, default: true } }, { timestamps: true });
export type UserHydratedDocument = HydratedDocument<UserDocument>;
export const UserModel = model<UserDocument>('User', schema);
export function toUserDTO(user: UserHydratedDocument) { return { id: user._id.toString(), email: user.email, role: user.role, active: user.active, createdAt: user.createdAt.toISOString() }; }