from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# 1. Твоя полная ссылка из Railway (не забудь, что начинается на mysql+pymysql://...)
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:eoKbIekLJmHTlRybkdkMdeaiFcFqgkZe@switchyard.proxy.rlwy.net:12934/railway"

# 2. Движок для работы с базой
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# 3. Сессии
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. База для создания таблиц
Base = declarative_base()