CREATE TABLE `companion_interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `learning_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `learned_expressions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `learning_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `learning_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `listening_details` (
	`session_id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `learning_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO learning_sessions (id, type, payload)
SELECT s.id, 'READING', json_object(
 'id', s.id, 'type', 'READING',
 'sourceType', CASE WHEN json_extract(a.payload, '$.provider') = 'simple_wikipedia' THEN 'WIKIPEDIA' ELSE 'MANUAL' END,
 'sourceUrl', json_extract(a.payload, '$.sourceUrl'),
 'userProvidedTitle', json_extract(a.payload, '$.title'),
 'level', NULL, 'startedAt', json_extract(s.payload, '$.createdAt'),
 'completedAt', CASE WHEN json_extract(s.payload, '$.status') = 'completed' THEN json_extract(s.payload, '$.updatedAt') ELSE NULL END,
 'duration', NULL, 'notes', '', 'migrated', json('true')
)
FROM sessions s JOIN snapshots a ON a.id = s.article_id;
