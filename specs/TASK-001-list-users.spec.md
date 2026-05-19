# TASK-001 - List Users

# Objective

Implement endpoint to list registered users.

---

# Endpoint

```http
GET /users
```

---

# Response

```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  }
]
```

---

# Business Rules

- Only authenticated administrators can access the endpoint.
- Password must never be returned.
- Deleted users must not appear.

---

# Error Responses

## Unauthorized

```json
{
  "statusCode": 401,
  "error": "UNAUTHORIZED",
  "message": "Authentication required"
}
```

## Forbidden

```json
{
  "statusCode": 403,
  "error": "FORBIDDEN",
  "message": "Insufficient permissions"
}
```

---

# Acceptance Criteria

- Endpoint returns all active users.
- Response excludes sensitive data.
- Endpoint requires authentication.
- Endpoint follows project architecture.
- Unit and integration tests are implemented.