// =============================================================
// AuditEQ v17.0.28 — Runtime Zod Input Validation & Schema Guard
// =============================================================

import { z } from 'zod';

export const ComplianceStatusEnum = z.enum(['PASS', 'FAIL', 'REVIEW']);

export const ManualReviewSchema = z.object({
  q1: ComplianceStatusEnum.optional(),
  q1_evidence: z.string().max(2000).optional(),
  q2: ComplianceStatusEnum.optional(),
  q2_evidence: z.string().max(2000).optional(),
  q3: ComplianceStatusEnum.optional(),
  q3_evidence: z.string().max(2000).optional(),
  q4: ComplianceStatusEnum.optional(),
  q4_evidence: z.string().max(2000).optional(),
  q5: ComplianceStatusEnum.optional(),
  q5_evidence: z.string().max(2000).optional(),
  review_reason: z.string().max(1000).optional(),
  human_review_reason: z.string().max(1000).optional(),
});

export const UserSignupSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/, 'Username must only contain letters, numbers, hyphens, and underscores.'),
  password: z.string().min(6).max(128),
  email: z.string().email().optional().nullable(),
  full_name: z.string().min(2).max(128).optional().nullable(),
  role: z.enum(['admin', 'compliance_officer', 'auditor', 'viewer']).optional(),
});

export const UserLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const EmailSendSchema = z.object({
  to: z.string().email().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().max(256).optional(),
});

export const BulkEmailSendSchema = z.object({
  advisor: z.string().min(1).max(128),
  from_date: z.string().max(32).optional().nullable(),
  to_date: z.string().max(32).optional().nullable(),
  subject: z.string().max(256).optional().nullable(),
  to: z.string().optional().nullable(),
  cc: z.string().max(512).optional().nullable(),
  marker_filter: z.string().max(32).optional().nullable(),
});

export const ArchivePeriodSchema = z.object({
  label: z.string().max(256).optional(),
});
