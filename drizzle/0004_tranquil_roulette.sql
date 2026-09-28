CREATE TABLE `study_plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`source_type` text NOT NULL,
	`source_url` text NOT NULL,
	`level` text,
	`article_id` text,
	`session_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `study_plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `learning_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "plan_item_position_positive" CHECK("study_plan_items"."position" >= 0),
	CONSTRAINT "plan_item_source" CHECK(("study_plan_items"."source_type" = 'WIKIPEDIA' AND "study_plan_items"."article_id" IS NOT NULL AND "study_plan_items"."level" IS NULL) OR ("study_plan_items"."source_type" = 'BREAKING_NEWS_ENGLISH' AND "study_plan_items"."article_id" IS NULL AND "study_plan_items"."level" IS NOT NULL AND "study_plan_items"."level" IN ('0','1','2','3','4','5','6','other')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_item_position` ON `study_plan_items` (`plan_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `plan_item_session` ON `study_plan_items` (`session_id`);--> statement-breakpoint
CREATE INDEX `plan_item_article` ON `study_plan_items` (`article_id`);--> statement-breakpoint
CREATE TABLE `study_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "plan_type" CHECK("study_plans"."type" IN ('READING', 'LISTENING'))
);
--> statement-breakpoint
CREATE INDEX `plan_type_created` ON `study_plans` (`type`,`created_at`);