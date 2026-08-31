-- Découverte MySQL 8.0+/8.4. Les UUID restent en CHAR(36) pendant la migration
-- afin de garantir une correspondance exacte avec Supabase et simplifier l'audit.
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  phone VARCHAR(40),
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin','super_admin') NOT NULL DEFAULT 'user',
  status ENUM('active','suspended','banned','deleted') NOT NULL DEFAULT 'active',
  email_confirmed_at DATETIME(3),
  last_sign_in_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_phone (phone),
  KEY idx_users_status_created (status, created_at DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(40), photo TEXT, gender VARCHAR(16) NOT NULL, city VARCHAR(120) NOT NULL,
  commune VARCHAR(120), bio TEXT, status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE, username VARCHAR(120) NOT NULL, age SMALLINT UNSIGNED NOT NULL,
  mode_libre_active BOOLEAN NOT NULL DEFAULT TRUE, mode_serieux_active BOOLEAN NOT NULL DEFAULT FALSE,
  boost_reason VARCHAR(255), boosted_until DATETIME(3), is_boosted BOOLEAN NOT NULL DEFAULT FALSE,
  country CHAR(2) DEFAULT 'CD', role VARCHAR(30) DEFAULT 'user',
  ip_country VARCHAR(8), ip_region VARCHAR(120), ip_city VARCHAR(120), ip_hash VARCHAR(190), ip_source VARCHAR(80),
  ip_confidence DECIMAL(6,5), ip_last_seen_at DATETIME(3), ip_city_mismatch BOOLEAN,
  admin_deleted_at DATETIME(3), admin_deleted_by CHAR(36), admin_delete_reason TEXT,
  admin_is_test_account BOOLEAN NOT NULL DEFAULT FALSE, admin_test_reasons JSON NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_profiles_user FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_profiles_feed (status, gender, city, created_at DESC),
  KEY idx_profiles_libre (status, mode_libre_active, gender, created_at DESC),
  KEY idx_profiles_serieux (status, mode_serieux_active, gender, created_at DESC),
  KEY idx_profiles_boost (status, boosted_until DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profile_access (
  user_id CHAR(36) PRIMARY KEY, profiles_access_until DATETIME(3),
  contact_quota INT NOT NULL DEFAULT 0, contact_quota_used INT NOT NULL DEFAULT 0,
  photo_quota INT NOT NULL DEFAULT 0, photo_quota_used INT NOT NULL DEFAULT 0,
  all_profiles_access BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_profile_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profile_photos (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, photo_url TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE, sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_profile_photos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_profile_photos_user (user_id, is_primary DESC, sort_order, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profile_access_entitlements (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, target_profile_id CHAR(36) NOT NULL,
  access_type VARCHAR(30) NOT NULL, mode VARCHAR(20) NOT NULL DEFAULT 'global', source VARCHAR(30) NOT NULL,
  payment_id VARCHAR(128), granted_by CHAR(36), credits_spent INT NOT NULL DEFAULT 0,
  starts_at DATETIME(3) NOT NULL, expires_at DATETIME(3), revoked_at DATETIME(3), reason TEXT,
  metadata JSON NOT NULL, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_entitlement_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_entitlement_target FOREIGN KEY (target_profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_entitlement (user_id, target_profile_id, access_type),
  KEY idx_entitlement_active (user_id, access_type, revoked_at, expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profile_access_events (
  id CHAR(36) PRIMARY KEY, entitlement_id CHAR(36), user_id CHAR(36), target_profile_id CHAR(36),
  access_type VARCHAR(30), event_type VARCHAR(60) NOT NULL, actor_id CHAR(36), payment_id VARCHAR(128),
  credits_spent INT NOT NULL DEFAULT 0, reason TEXT, metadata JSON NOT NULL, created_at DATETIME(3) NOT NULL,
  KEY idx_access_events_user_created (user_id, created_at DESC),
  KEY idx_access_events_target_created (target_profile_id, created_at DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contact_packs (
  id CHAR(36) PRIMARY KEY, name VARCHAR(160) NOT NULL, quota INT NOT NULL DEFAULT 0,
  contact_quota INT, photo_quota INT, all_profiles_access BOOLEAN NOT NULL DEFAULT FALSE,
  price_cents INT NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INT NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36), type VARCHAR(80), provider VARCHAR(80),
  payment_provider VARCHAR(80), payment_method VARCHAR(80), transaction_ref VARCHAR(190),
  subscription_id VARCHAR(190), amount DECIMAL(14,2), amount_cents BIGINT, currency CHAR(3) NOT NULL,
  status VARCHAR(30) NOT NULL, reference VARCHAR(190), metadata JSON NOT NULL, created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_payments_user_created (user_id, created_at DESC),
  KEY idx_payments_status_provider (status, provider),
  UNIQUE KEY uq_payments_transaction_ref (transaction_ref)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_events (
  id CHAR(36) PRIMARY KEY, payment_id VARCHAR(128), provider VARCHAR(80) NOT NULL,
  event_type VARCHAR(80) NOT NULL, event_id VARCHAR(190), signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at DATETIME(3), payload JSON NOT NULL, created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_payment_event (provider, event_id), KEY idx_payment_events_payment (payment_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_credit_balances (
  user_id CHAR(36) PRIMARY KEY, contact_credits INT NOT NULL DEFAULT 0, photo_credits INT NOT NULL DEFAULT 0,
  premium_credits INT NOT NULL DEFAULT 0, updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_credit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, plan_key VARCHAR(100) NOT NULL, status VARCHAR(30) NOT NULL,
  source VARCHAR(30) NOT NULL, payment_id VARCHAR(128), granted_by CHAR(36), starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3), metadata JSON NOT NULL, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
  KEY idx_subscriptions_user_status (user_id, status, ends_at),
  CONSTRAINT fk_subscription_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) PRIMARY KEY,
  last_message_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_conversations_last_message (last_message_at DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), last_read_at DATETIME(3),
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT fk_cp_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_cp_user_conversation (user_id, conversation_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY, conversation_id CHAR(36) NOT NULL, sender_id CHAR(36) NOT NULL,
  content TEXT NOT NULL, message_type VARCHAR(30) NOT NULL DEFAULT 'text', media_url TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), read_at DATETIME(3), deleted_at DATETIME(3),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_messages_conversation_created (conversation_id, created_at, id),
  KEY idx_messages_unread (conversation_id, read_at, sender_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS public_publications (
  id CHAR(36) PRIMARY KEY, author_id CHAR(36), title VARCHAR(255) NOT NULL, content TEXT NOT NULL,
  content_type VARCHAR(20) NOT NULL, image_url TEXT, video_url TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_publications_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_publications_feed (is_active, is_pinned DESC, created_at DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id CHAR(36) PRIMARY KEY, title VARCHAR(255) NOT NULL, image_url TEXT NOT NULL, text TEXT NOT NULL,
  start_at DATETIME(3) NOT NULL, end_at DATETIME(3) NOT NULL, audience VARCHAR(30) NOT NULL,
  priority INT NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME(3) NOT NULL,
  KEY idx_campaigns_active (is_active, start_at, end_at, priority DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) PRIMARY KEY, reporter_id CHAR(36), reported_id CHAR(36), type VARCHAR(80), reason TEXT,
  status VARCHAR(30) NOT NULL, created_at DATETIME(3) NOT NULL, resolved_at DATETIME(3), resolved_by CHAR(36),
  KEY idx_reports_status_created (status, created_at DESC),
  KEY idx_reports_reported (reported_id, created_at DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS blocked_profiles (
  id CHAR(36) PRIMARY KEY, blocker_id CHAR(36) NOT NULL, blocked_profile_id CHAR(36) NOT NULL,
  reason TEXT, created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_block (blocker_id, blocked_profile_id),
  KEY idx_block_reverse (blocked_profile_id, blocker_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mass_messages (
  id CHAR(36) PRIMARY KEY, title VARCHAR(255) NOT NULL, body TEXT NOT NULL, content_type VARCHAR(20) NOT NULL,
  image_url TEXT, video_url TEXT, segment VARCHAR(30) NOT NULL, segment_value VARCHAR(255),
  sent_at DATETIME(3), created_by CHAR(36), created_at DATETIME(3) NOT NULL,
  target_filters JSON, recipient_count INT, preview_user_ids JSON,
  KEY idx_mass_messages_sent (sent_at DESC, created_at DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_settings (
  id CHAR(36) PRIMARY KEY, `key` VARCHAR(190) NOT NULL, value JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_admin_settings_key (`key`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_announcement_read_state (
  user_id CHAR(36) PRIMARY KEY, last_read_announcements_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_announcement_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_publication_read_state (
  user_id CHAR(36) PRIMARY KEY, last_read_publications_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_publication_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_events (
  id CHAR(36) PRIMARY KEY, actor_id CHAR(36), target_user_id CHAR(36), action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(120), entity_id VARCHAR(190), reason TEXT, metadata JSON NOT NULL, created_at DATETIME(3) NOT NULL,
  KEY idx_audit_actor_created (actor_id, created_at DESC), KEY idx_audit_target_created (target_user_id, created_at DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS call_sessions (
  id CHAR(36) PRIMARY KEY, conversation_id CHAR(36) NOT NULL, initiated_by CHAR(36) NOT NULL,
  kind ENUM('audio','video') NOT NULL, room_name VARCHAR(190) NOT NULL,
  status ENUM('ringing','active','ended','missed','rejected','failed') NOT NULL DEFAULT 'ringing',
  started_at DATETIME(3), ended_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_calls_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_calls_initiator FOREIGN KEY (initiated_by) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_calls_conversation_created (conversation_id, created_at DESC),
  KEY idx_calls_status_created (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS call_participants (
  call_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, joined_at DATETIME(3), left_at DATETIME(3),
  PRIMARY KEY (call_id, user_id),
  CONSTRAINT fk_call_participant_call FOREIGN KEY (call_id) REFERENCES call_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_call_participant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS migration_runs (
  id CHAR(36) PRIMARY KEY, source VARCHAR(80) NOT NULL, started_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3), status ENUM('running','verified','failed') NOT NULL,
  source_snapshot JSON, target_snapshot JSON, error_text TEXT
) ENGINE=InnoDB;
