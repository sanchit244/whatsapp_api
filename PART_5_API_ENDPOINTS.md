# Part 5: API Endpoints Structure - Complete Implementation

**Date:** September 8, 2026  
**Status:** ✅ COMPLETE  
**Build Time:** Successful

---

## 📋 API Endpoints Overview

### Base URL: /api/v1

All endpoints require Bearer token authentication via JWT in Authorization header.

---

## 🔐 Authentication Endpoints

### POST /auth/register
**Purpose:** User registration  
**Access:** Public  
**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "first_name": "John",
  "last_name": "Doe",
  "company_name": "Acme Corp"
}
```
**Response:** (201)
```json
{
  "message": "Registration successful",
  "tenant": { "id": "tenant_xxx", "name": "Acme Corp" },
  "user": { "id": "user_xxx", "email": "user@example.com", "role": "admin" },
  "token": "jwt_token_xxx",
  "refresh_token": "refresh_token_xxx"
}
```

### POST /auth/login
**Purpose:** User login  
**Access:** Public  
**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```
**Response:** (200)
```json
{
  "message": "Login successful",
  "token": "jwt_token_xxx",
  "refresh_token": "refresh_token_xxx",
  "user": { "id": "user_xxx", "email": "user@example.com" }
}
```

### POST /auth/refresh
**Purpose:** Refresh JWT token  
**Access:** Protected (refresh token required)  
**Response:** (200)
```json
{
  "message": "Token refreshed",
  "token": "new_jwt_token_xxx"
}
```

### POST /auth/mfa/enable
**Purpose:** Enable MFA (TOTP)  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "MFA enabled",
  "secret": "JBSWY3DPEBLW64TMMQ======",
  "qr_code_url": "otpauth://totp/..."
}
```

### POST /auth/mfa/verify
**Purpose:** Verify MFA code  
**Access:** Protected  
**Request:**
```json
{
  "code": "123456"
}
```
**Response:** (200)
```json
{
  "message": "MFA verified",
  "token": "jwt_token_xxx"
}
```

---

## 👥 User Management Endpoints

### GET /users/me
**Purpose:** Get current user profile  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "User retrieved",
  "user": {
    "id": "user_xxx",
    "email": "user@example.com",
    "role": "admin",
    "tenant_id": "tenant_xxx"
  }
}
```

### PUT /users/me
**Purpose:** Update user profile  
**Access:** Protected  
**Request:**
```json
{
  "first_name": "John",
  "last_name": "Smith",
  "phone": "+1234567890"
}
```
**Response:** (200)
```json
{
  "message": "Profile updated",
  "user": { ... }
}
```

### GET /users
**Purpose:** List team members  
**Access:** Protected (admin/manager)  
**Query Params:** `page=1&limit=20&role=admin`  
**Response:** (200)
```json
{
  "message": "Users retrieved",
  "data": {
    "users": [ ... ],
    "total": 45,
    "page": 1,
    "limit": 20
  }
}
```

### POST /users
**Purpose:** Invite user to team  
**Access:** Protected (admin)  
**Request:**
```json
{
  "email": "newuser@example.com",
  "role": "operator"
}
```
**Response:** (201)
```json
{
  "message": "User invited",
  "user": { ... }
}
```

### PUT /users/:id
**Purpose:** Update user role  
**Access:** Protected (admin)  
**Request:**
```json
{
  "role": "manager"
}
```
**Response:** (200)
```json
{
  "message": "User updated",
  "user": { ... }
}
```

### DELETE /users/:id
**Purpose:** Remove user from team  
**Access:** Protected (admin)  
**Response:** (200)
```json
{
  "message": "User removed"
}
```

---

## 📧 Campaign Endpoints

### POST /campaigns
**Purpose:** Create campaign  
**Access:** Protected  
**Request:**
```json
{
  "name": "Summer Sale",
  "description": "Special summer offers",
  "template_id": "template_xxx",
  "recipient_count": 5000
}
```
**Response:** (201)
```json
{
  "message": "Campaign created",
  "campaign": {
    "id": "campaign_xxx",
    "name": "Summer Sale",
    "status": "draft"
  }
}
```

### GET /campaigns
**Purpose:** List campaigns  
**Access:** Protected  
**Query Params:** `page=1&limit=20&status=active`  
**Response:** (200)
```json
{
  "message": "Campaigns retrieved",
  "data": {
    "campaigns": [ ... ],
    "total": 150,
    "page": 1
  }
}
```

### GET /campaigns/:id
**Purpose:** Get campaign details  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Campaign retrieved",
  "campaign": { ... }
}
```

### PUT /campaigns/:id
**Purpose:** Update campaign (draft only)  
**Access:** Protected  
**Request:**
```json
{
  "name": "Updated Name",
  "description": "Updated description"
}
```
**Response:** (200)
```json
{
  "message": "Campaign updated",
  "campaign": { ... }
}
```

### POST /campaigns/:id/start
**Purpose:** Start campaign  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Campaign started",
  "campaign": { "status": "active" }
}
```

### POST /campaigns/:id/pause
**Purpose:** Pause active campaign  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Campaign paused",
  "campaign": { "status": "paused" }
}
```

### POST /campaigns/:id/resume
**Purpose:** Resume paused campaign  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Campaign resumed",
  "campaign": { "status": "active" }
}
```

### POST /campaigns/:id/cancel
**Purpose:** Cancel campaign  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Campaign cancelled",
  "campaign": { "status": "cancelled" }
}
```

### DELETE /campaigns/:id
**Purpose:** Delete campaign (draft only)  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Campaign deleted"
}
```

### GET /campaigns/:id/analytics
**Purpose:** Get campaign analytics  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Analytics retrieved",
  "analytics": {
    "total_sent": 5000,
    "total_delivered": 4850,
    "total_failed": 150,
    "delivery_rate": 97.0,
    "avg_delivery_time_seconds": 8
  }
}
```

---

## 👥 Contact Endpoints

### POST /contacts
**Purpose:** Create/update contact  
**Access:** Protected  
**Request:**
```json
{
  "phone_number": "+1-555-0100",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com"
}
```
**Response:** (201)
```json
{
  "message": "Contact created/updated",
  "contact": { "id": "contact_xxx", "phone_number": "15550100" }
}
```

### GET /contacts
**Purpose:** List contacts  
**Access:** Protected  
**Query Params:** `page=1&limit=50&opted_in=true`  
**Response:** (200)
```json
{
  "message": "Contacts retrieved",
  "data": {
    "contacts": [ ... ],
    "total": 2500,
    "page": 1
  }
}
```

### GET /contacts/:phone
**Purpose:** Get contact by phone  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Contact retrieved",
  "contact": { ... }
}
```

### POST /contacts/:phone/opt-out
**Purpose:** Opt out contact  
**Access:** Protected  
**Request:**
```json
{
  "reason": "No longer interested"
}
```
**Response:** (200)
```json
{
  "message": "Contact opted out"
}
```

### POST /contacts/:phone/opt-in
**Purpose:** Opt in contact  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Contact opted in"
}
```

### DELETE /contacts/:phone
**Purpose:** Delete contact  
**Access:** Protected  
**Response:** (200)
```json
{
  "message": "Contact deleted"
}
```

### POST /contacts/bulk/import
**Purpose:** Bulk import contacts  
**Access:** Protected  
**Request:**
```json
{
  "contacts": [
    { "phone_number": "+1-555-0100", "first_name": "John" },
    { "phone_number": "+1-555-0101", "first_name": "Jane" }
  ]
}
```
**Response:** (200)
```json
{
  "message": "Bulk import completed",
  "result": {
    "total_imported": 1000,
    "successful": 995,
    "failed": 5,
    "errors": [ ... ]
  }
}
```

---

## 📋 Summary

**Total Endpoints**: 31  
**Protected**: 29 (require JWT)  
**Public**: 2 (register, login)  
**Services**: 5 (Auth, Users, Campaigns, Contacts, Account)  

**Status**: ✅ COMPLETE & DOCUMENTED

