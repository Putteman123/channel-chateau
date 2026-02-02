from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import jwt
import bcrypt
import re
import aiohttp

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'iptv-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: str
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class Channel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: str
    logo: Optional[str] = None
    group: Optional[str] = "Uncategorized"
    epg_id: Optional[str] = None

class PlaylistCreate(BaseModel):
    name: str
    url: Optional[str] = None
    content: Optional[str] = None

class PlaylistResponse(BaseModel):
    id: str
    user_id: str
    name: str
    channel_count: int
    created_at: datetime

class FavoriteCreate(BaseModel):
    channel_name: str
    channel_url: str
    channel_logo: Optional[str] = None
    channel_group: Optional[str] = None

class FavoriteResponse(BaseModel):
    id: str
    user_id: str
    channel_name: str
    channel_url: str
    channel_logo: Optional[str] = None
    channel_group: Optional[str] = None
    created_at: datetime

# ==================== HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    expiration = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        'user_id': user_id,
        'exp': expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get('user_id')
        user = await db.users.find_one({'id': user_id})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def parse_m3u(content: str) -> List[Channel]:
    """Parse M3U/M3U8 playlist content and extract channels"""
    channels = []
    lines = content.strip().split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if line.startswith('#EXTINF:'):
            # Parse EXTINF line
            channel_info = {
                'id': str(uuid.uuid4()),
                'name': 'Unknown Channel',
                'url': '',
                'logo': None,
                'group': 'Uncategorized',
                'epg_id': None
            }
            
            # Extract tvg-logo
            logo_match = re.search(r'tvg-logo="([^"]+)"', line)
            if logo_match:
                channel_info['logo'] = logo_match.group(1)
            
            # Extract group-title
            group_match = re.search(r'group-title="([^"]+)"', line)
            if group_match:
                channel_info['group'] = group_match.group(1)
            
            # Extract tvg-id for EPG
            epg_match = re.search(r'tvg-id="([^"]+)"', line)
            if epg_match:
                channel_info['epg_id'] = epg_match.group(1)
            
            # Extract channel name (after the last comma)
            name_match = re.search(r',(.+)$', line)
            if name_match:
                channel_info['name'] = name_match.group(1).strip()
            
            # Get URL from next non-comment line
            i += 1
            while i < len(lines):
                url_line = lines[i].strip()
                if url_line and not url_line.startswith('#'):
                    channel_info['url'] = url_line
                    break
                i += 1
            
            if channel_info['url']:
                channels.append(Channel(**channel_info))
        
        i += 1
    
    return channels

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({'email': user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = {
        'id': str(uuid.uuid4()),
        'email': user_data.email.lower(),
        'password_hash': hash_password(user_data.password),
        'name': user_data.name,
        'created_at': datetime.utcnow()
    }
    await db.users.insert_one(user)
    
    token = create_token(user['id'])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user['id'],
            email=user['email'],
            name=user['name'],
            created_at=user['created_at']
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    user = await db.users.find_one({'email': user_data.email.lower()})
    if not user or not verify_password(user_data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user['id'])
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user['id'],
            email=user['email'],
            name=user.get('name'),
            created_at=user['created_at']
        )
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user=Depends(get_current_user)):
    return UserResponse(
        id=user['id'],
        email=user['email'],
        name=user.get('name'),
        created_at=user['created_at']
    )

# ==================== PLAYLIST ROUTES ====================

@api_router.post("/playlists", response_model=PlaylistResponse)
async def create_playlist(playlist_data: PlaylistCreate, user=Depends(get_current_user)):
    """Create a playlist from M3U content or URL"""
    content = playlist_data.content
    
    # If URL provided, fetch content
    if playlist_data.url and not content:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(playlist_data.url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    if response.status == 200:
                        content = await response.text()
                    else:
                        raise HTTPException(status_code=400, detail="Failed to fetch playlist from URL")
        except Exception as e:
            logger.error(f"Error fetching playlist: {e}")
            raise HTTPException(status_code=400, detail=f"Error fetching playlist: {str(e)}")
    
    if not content:
        raise HTTPException(status_code=400, detail="No playlist content provided")
    
    # Parse M3U content
    channels = parse_m3u(content)
    if not channels:
        raise HTTPException(status_code=400, detail="No valid channels found in playlist")
    
    playlist = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'name': playlist_data.name,
        'url': playlist_data.url,
        'channels': [ch.dict() for ch in channels],
        'created_at': datetime.utcnow()
    }
    await db.playlists.insert_one(playlist)
    
    return PlaylistResponse(
        id=playlist['id'],
        user_id=playlist['user_id'],
        name=playlist['name'],
        channel_count=len(channels),
        created_at=playlist['created_at']
    )

@api_router.post("/playlists/upload")
async def upload_playlist(
    name: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    """Upload M3U file"""
    content = await file.read()
    try:
        content_str = content.decode('utf-8')
    except:
        content_str = content.decode('latin-1')
    
    channels = parse_m3u(content_str)
    if not channels:
        raise HTTPException(status_code=400, detail="No valid channels found in file")
    
    playlist = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'name': name,
        'url': None,
        'channels': [ch.dict() for ch in channels],
        'created_at': datetime.utcnow()
    }
    await db.playlists.insert_one(playlist)
    
    return PlaylistResponse(
        id=playlist['id'],
        user_id=playlist['user_id'],
        name=playlist['name'],
        channel_count=len(channels),
        created_at=playlist['created_at']
    )

@api_router.get("/playlists", response_model=List[PlaylistResponse])
async def get_playlists(user=Depends(get_current_user)):
    playlists = await db.playlists.find({'user_id': user['id']}).to_list(100)
    return [
        PlaylistResponse(
            id=p['id'],
            user_id=p['user_id'],
            name=p['name'],
            channel_count=len(p.get('channels', [])),
            created_at=p['created_at']
        )
        for p in playlists
    ]

@api_router.get("/playlists/{playlist_id}/channels")
async def get_playlist_channels(
    playlist_id: str,
    search: Optional[str] = None,
    group: Optional[str] = None,
    user=Depends(get_current_user)
):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    channels = playlist.get('channels', [])
    
    # Filter by search query
    if search:
        search_lower = search.lower()
        channels = [ch for ch in channels if search_lower in ch['name'].lower()]
    
    # Filter by group
    if group:
        channels = [ch for ch in channels if ch.get('group') == group]
    
    return channels

@api_router.get("/playlists/{playlist_id}/groups")
async def get_playlist_groups(playlist_id: str, user=Depends(get_current_user)):
    playlist = await db.playlists.find_one({'id': playlist_id, 'user_id': user['id']})
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    
    groups = set()
    for ch in playlist.get('channels', []):
        if ch.get('group'):
            groups.add(ch['group'])
    
    return sorted(list(groups))

@api_router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, user=Depends(get_current_user)):
    result = await db.playlists.delete_one({'id': playlist_id, 'user_id': user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return {"message": "Playlist deleted"}

# ==================== FAVORITES ROUTES ====================

@api_router.post("/favorites", response_model=FavoriteResponse)
async def add_favorite(favorite_data: FavoriteCreate, user=Depends(get_current_user)):
    # Check if already favorited
    existing = await db.favorites.find_one({
        'user_id': user['id'],
        'channel_url': favorite_data.channel_url
    })
    if existing:
        raise HTTPException(status_code=400, detail="Channel already in favorites")
    
    favorite = {
        'id': str(uuid.uuid4()),
        'user_id': user['id'],
        'channel_name': favorite_data.channel_name,
        'channel_url': favorite_data.channel_url,
        'channel_logo': favorite_data.channel_logo,
        'channel_group': favorite_data.channel_group,
        'created_at': datetime.utcnow()
    }
    await db.favorites.insert_one(favorite)
    
    return FavoriteResponse(**favorite)

@api_router.get("/favorites", response_model=List[FavoriteResponse])
async def get_favorites(user=Depends(get_current_user)):
    favorites = await db.favorites.find({'user_id': user['id']}).to_list(500)
    return [FavoriteResponse(**f) for f in favorites]

@api_router.delete("/favorites/{favorite_id}")
async def remove_favorite(favorite_id: str, user=Depends(get_current_user)):
    result = await db.favorites.delete_one({'id': favorite_id, 'user_id': user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"message": "Removed from favorites"}

@api_router.delete("/favorites/by-url/{channel_url:path}")
async def remove_favorite_by_url(channel_url: str, user=Depends(get_current_user)):
    result = await db.favorites.delete_one({'channel_url': channel_url, 'user_id': user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"message": "Removed from favorites"}

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "IPTV API is running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
