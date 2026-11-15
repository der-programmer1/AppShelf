import {sqliteTable,text,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';

export const accounts=sqliteTable('accounts',{
  id:text('id').primaryKey(),name:text('name').notNull(),nameKey:text('name_key').notNull().unique(),
  passwordHash:text('password_hash').notNull(),recoveryHash:text('recovery_hash').notNull(),
  createdAt:integer('created_at').notNull(),authVersion:integer('auth_version').notNull().default(1),
});
export const players=sqliteTable('players',{
  id:text('id').primaryKey(),authUid:text('auth_uid').notNull().unique().references(()=>accounts.id),name:text('name').notNull(),createdAt:integer('created_at').notNull(),
  coins:text('coins').notNull().default('0'),lifetimeValue:text('lifetime_value').notNull().default('0'),
  rateMicros:text('rate_micros').notNull(),remainder:text('remainder').notNull().default('0'),
  settledAt:integer('settled_at').notNull(),lastActiveAt:integer('last_active_at').notNull(),levelsJson:text('levels_json').notNull(),
  revision:integer('revision').notNull().default(1),lastMutation:text('last_mutation').notNull(),
});
export const sessions=sqliteTable('sessions',{
  tokenHash:text('token_hash').primaryKey(),accountId:text('account_id').notNull().references(()=>accounts.id,{onDelete:'cascade'}),
  authVersion:integer('auth_version').notNull(),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[index('session_account').on(t.accountId),index('session_expiry').on(t.expiresAt)]);
export const actions=sqliteTable('actions',{
  playerId:text('player_id').notNull().references(()=>players.id,{onDelete:'cascade'}),requestId:text('request_id').notNull(),payload:text('payload').notNull(),response:text('response').notNull(),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.playerId,t.requestId]}),index('action_time').on(t.createdAt)]);
export const limits=sqliteTable('limits',{
  key:text('key').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull(),
},t=>[index('limit_expiry').on(t.expiresAt)]);
