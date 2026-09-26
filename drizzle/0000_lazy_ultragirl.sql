CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `learning_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `export_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`font_size` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
