CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`password_hash` text NOT NULL,
	`recovery_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`auth_version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_key_unique` ON `accounts` (`name_key`);--> statement-breakpoint
CREATE TABLE `actions` (
	`player_id` text NOT NULL,
	`request_id` text NOT NULL,
	`payload` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`player_id`, `request_id`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `action_time` ON `actions` (`created_at`);--> statement-breakpoint
CREATE TABLE `limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `limit_expiry` ON `limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_uid` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`coins` text DEFAULT '0' NOT NULL,
	`lifetime_value` text DEFAULT '0' NOT NULL,
	`rate_micros` text NOT NULL,
	`remainder` text DEFAULT '0' NOT NULL,
	`settled_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`levels_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_mutation` text NOT NULL,
	FOREIGN KEY (`auth_uid`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_auth_uid_unique` ON `players` (`auth_uid`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`auth_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_account` ON `sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `session_expiry` ON `sessions` (`expires_at`);