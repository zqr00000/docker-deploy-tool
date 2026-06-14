export interface DefaultTemplate {
  id: string
  name: string
  description: string
  category: string
  dockerCompose: string
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    id: 'nginx-static',
    name: 'Nginx 静态网站',
    description: 'Nginx 静态网站服务器，用于托管静态 HTML、CSS、JS 文件',
    category: 'web',
    dockerCompose: `version: '3.8'
services:
  nginx:
    image: nginx:latest
    ports:
      - "80:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    restart: unless-stopped`
  },
  {
    id: 'mysql',
    name: 'MySQL 数据库',
    description: 'MySQL 8.0 数据库服务器，适合中小型应用数据存储',
    category: 'database',
    dockerCompose: `version: '3.8'
services:
  mysql:
    image: mysql:8.0
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: your_password
      MYSQL_DATABASE: app
      MYSQL_USER: app_user
      MYSQL_PASSWORD: app_password
    volumes:
      - mysql_data:/var/lib/mysql
    restart: unless-stopped

volumes:
  mysql_data:`
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL 数据库',
    description: 'PostgreSQL 数据库服务器，支持 JSON、地理空间数据等高级特性',
    category: 'database',
    dockerCompose: `version: '3.8'
services:
  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_password
      POSTGRES_DB: app
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:`
  },
  {
    id: 'redis',
    name: 'Redis 缓存',
    description: 'Redis 内存数据库，常用于缓存、Session 存储、消息队列',
    category: 'cache',
    dockerCompose: `version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:`
  },
  {
    id: 'mongodb',
    name: 'MongoDB 数据库',
    description: 'MongoDB NoSQL 数据库，文档型数据库适合敏捷开发',
    category: 'database',
    dockerCompose: `version: '3.8'
services:
  mongodb:
    image: mongo:6
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: your_password
      MONGO_INITDB_DATABASE: app
    volumes:
      - mongodb_data:/data/db
    restart: unless-stopped

volumes:
  mongodb_data:`
  },
  {
    id: 'wordpress',
    name: 'WordPress CMS',
    description: 'WordPress 内容管理系统，快速搭建博客和企业网站',
    category: 'cms',
    dockerCompose: `version: '3.8'
services:
  wordpress:
    image: wordpress:latest
    ports:
      - "8080:80"
    environment:
      WORDPRESS_DB_HOST: mysql
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpress_password
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wordpress_data:/var/www/html
    depends_on:
      - mysql
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpress_password
    volumes:
      - mysql_wp_data:/var/lib/mysql
    restart: unless-stopped

volumes:
  wordpress_data:
  mysql_wp_data:`
  },
  {
    id: 'nodejs',
    name: 'Node.js 应用',
    description: '通用 Node.js 应用模板，基于 Alpine 轻量级镜像',
    category: 'app',
    dockerCompose: `version: '3.8'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
    volumes:
      - ./src:/app/src
      - /app/node_modules
    restart: unless-stopped`
  },
  {
    id: 'python-flask',
    name: 'Python Flask 应用',
    description: 'Python Flask Web 框架模板，适合快速开发轻量级 Web API',
    category: 'app',
    dockerCompose: `version: '3.8'
services:
  flask:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      FLASK_ENV: production
      SECRET_KEY: your_secret_key
    volumes:
      - ./app:/app
      - /app/__pycache__
    restart: unless-stopped`
  }
]
