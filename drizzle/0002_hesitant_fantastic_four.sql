CREATE TABLE `anki_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`payload` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `learning_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `anki_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `candidate_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
