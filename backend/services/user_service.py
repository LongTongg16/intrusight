import re
from database import db
from core.security import hash_password, verify_password

def validate_password_strength(password: str) -> None:
    # Validate password meets complexity requirements
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 UTF-8 bytes")
    
    if not re.search(r'[a-z]', password):
        raise ValueError("Password must contain at least one lowercase letter")
    
    if not re.search(r'[A-Z]', password):
        raise ValueError("Password must contain at least one uppercase letter")
    
    if not re.search(r'[0-9]', password):
        raise ValueError("Password must contain at least one digit")
    
    if not re.search(r'[!@#$%^&*()_\-+=\[\]{};:\'",.<>?/\\|`~]', password):
        raise ValueError("Password must contain at least one special character")

def validate_full_name(full_name: str) -> None:
    # Validate full name format
    if len(full_name) < 2:
        raise ValueError("Full name must be at least 2 characters long")
    
    if len(full_name) > 100:
        raise ValueError("Full name must not exceed 100 characters")
    
    if not re.match(r"^[a-zA-Z\s\-\']+$", full_name):
        raise ValueError("Full name can only contain letters, spaces, hyphens, and apostrophes")

async def get_user_by_email(email: str):
    email = email.strip().lower()
    user = await db.users.find_one({"email": email})
    return user

async def create_user(email: str, password: str, full_name: str, role: str):
    email = email.strip().lower()
    full_name = full_name.strip()
    role = role.strip()
    
    # Check if user already exists
    existing = await db.users.find_one({"email": email})
    if existing:
        raise ValueError("Email already exists")
    
    # Validate password strength
    validate_password_strength(password)
    
    # Validate full name
    validate_full_name(full_name)
    
    # Hash password
    hashed_password = hash_password(password)
    
    # Insert into database
    user_doc = {
        "email": email,
        "hashed_password": hashed_password,
        "full_name": full_name,
        "role": role,
        "status": "pending",
        "token_version": 0,
    }
    result = await db.users.insert_one(user_doc)
    
    # Return the created user
    return {
        "id": str(result.inserted_id),
        "email": email,
        "full_name": full_name,
        "role": role,
        "status": "pending"
    }

async def get_user_by_id(user_id: str):
    from bson import ObjectId
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        return user
    except:
        return None

async def get_all_users():
    users = []
    async for user in db.users.find({}):
        users.append({
            "id": str(user["_id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "status": user.get("status", "pending")
        })
    return users

async def update_user_profile(user_id: str, full_name: str):
    from bson import ObjectId
    try:
        update_fields = {}

        # Validate & update full name
        if full_name is not None:
            validate_full_name(full_name)
            update_fields["full_name"] = full_name.strip()

        # If nothing to update, return current user
        if not update_fields:
            return await db.users.find_one({"_id": ObjectId(user_id)})

        # Update in DB
        result = await db.users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": update_fields},
            return_document=True
        )

        return result

    except ValueError:
        raise
    except Exception:
        return None

async def change_password(user_id: str, old_password: str, new_password: str):
    from bson import ObjectId
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return None
        
        if not verify_password(old_password, user["hashed_password"]):
            raise ValueError("Current password is incorrect")
        
        validate_password_strength(new_password)
        new_hashed = hash_password(new_password)
        
        result = await db.users.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {
                "$set": {"hashed_password": new_hashed},
                "$inc": {"token_version": 1},
            },
            return_document=True
        )
        return result
    except ValueError as e:
        raise e
    except:
        return None
