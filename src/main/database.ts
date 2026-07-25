import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import log from 'electron-log'
import { randomUUID } from 'crypto'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.')
  }
  return db
}

export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
    log.info(`Created database directory: ${dbDir}`)
  }

  const dbPath = join(dbDir, 'docker-deploy-tool.db')
  log.info(`Initializing database at: ${dbPath}`)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  createTables()

  log.info('Database initialized successfully')
  return db
}

function createTables(): void {
  if (!db) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      authType TEXT NOT NULL DEFAULT 'password',
      password TEXT,
      privateKey TEXT,
      status TEXT DEFAULT 'offline',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      dockerCompose TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      templateId TEXT NOT NULL,
      serverId TEXT NOT NULL,
      projectPath TEXT NOT NULL,
      status TEXT DEFAULT 'stopped',
      containerIds TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (templateId) REFERENCES templates(id) ON DELETE CASCADE,
      FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      targetType TEXT NOT NULL,
      targetId TEXT,
      targetName TEXT,
      status TEXT NOT NULL,
      details TEXT,
      serverId TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deployment_history (
      id TEXT PRIMARY KEY,
      appId TEXT NOT NULL,
      appName TEXT NOT NULL,
      serverId TEXT NOT NULL,
      version INTEGER NOT NULL,
      dockerCompose TEXT NOT NULL,
      envVariables TEXT,
      deployedAt TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (appId) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS server_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_group_members (
      groupId TEXT NOT NULL,
      serverId TEXT NOT NULL,
      PRIMARY KEY (groupId, serverId),
      FOREIGN KEY (groupId) REFERENCES server_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ruleType TEXT NOT NULL,
      serverId TEXT,
      appId TEXT,
      threshold REAL,
      enabled INTEGER NOT NULL DEFAULT 1,
      notifyChannels TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alert_history (
      id TEXT PRIMARY KEY,
      ruleId TEXT NOT NULL,
      ruleName TEXT NOT NULL,
      alertType TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      triggeredAt TEXT NOT NULL,
      resolvedAt TEXT,
      FOREIGN KEY (ruleId) REFERENCES alert_rules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      taskType TEXT NOT NULL,
      cronExpression TEXT NOT NULL,
      serverId TEXT NOT NULL,
      appId TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      lastRun TEXT,
      lastStatus TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (appId) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS health_check_configs (
      id TEXT PRIMARY KEY,
      appId TEXT NOT NULL,
      autoRestart INTEGER NOT NULL DEFAULT 0,
      maxRestarts INTEGER NOT NULL DEFAULT 3,
      restartWindow INTEGER NOT NULL DEFAULT 3600,
      notifyOnRestart INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (appId) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS health_check_history (
      id TEXT PRIMARY KEY,
      appId TEXT NOT NULL,
      containerId TEXT,
      containerName TEXT,
      checkTime TEXT NOT NULL,
      status TEXT NOT NULL,
      healthStatus TEXT,
      restartCount INTEGER DEFAULT 0,
      autoRestarted INTEGER DEFAULT 0,
      errorMessage TEXT,
      responseTime INTEGER,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (appId) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resource_metrics (
      id TEXT PRIMARY KEY,
      serverId TEXT NOT NULL,
      appId TEXT,
      containerId TEXT,
      cpuPercent REAL,
      memoryUsage REAL,
      memoryLimit REAL,
      networkRx REAL,
      networkTx REAL,
      blockRead REAL,
      blockWrite REAL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (appId) REFERENCES apps(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_resource_metrics_server_time ON resource_metrics(serverId, timestamp);
    CREATE INDEX IF NOT EXISTS idx_resource_metrics_app_time ON resource_metrics(appId, timestamp);

    -- 性能优化索引：加速频繁查询
    -- servers 表索引
    CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
    CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name);

    -- apps 表索引
    CREATE INDEX IF NOT EXISTS idx_apps_serverId ON apps(serverId);
    CREATE INDEX IF NOT EXISTS idx_apps_templateId ON apps(templateId);
    CREATE INDEX IF NOT EXISTS idx_apps_status ON apps(status);
    CREATE INDEX IF NOT EXISTS idx_apps_server_status ON apps(serverId, status);

    -- audit_logs 表索引
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_targetType ON audit_logs(targetType);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_serverId ON audit_logs(serverId);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);

    -- deployment_history 表索引
    CREATE INDEX IF NOT EXISTS idx_deployment_history_appId ON deployment_history(appId);
    CREATE INDEX IF NOT EXISTS idx_deployment_history_deployedAt ON deployment_history(deployedAt);
    CREATE INDEX IF NOT EXISTS idx_deployment_history_serverId ON deployment_history(serverId);

    -- alert_rules 表索引
    CREATE INDEX IF NOT EXISTS idx_alert_rules_serverId ON alert_rules(serverId);
    CREATE INDEX IF NOT EXISTS idx_alert_rules_appId ON alert_rules(appId);
    CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled);

    -- alert_history 表索引
    CREATE INDEX IF NOT EXISTS idx_alert_history_ruleId ON alert_history(ruleId);
    CREATE INDEX IF NOT EXISTS idx_alert_history_triggeredAt ON alert_history(triggeredAt);
    CREATE INDEX IF NOT EXISTS idx_alert_history_status ON alert_history(status);

    -- scheduled_tasks 表索引
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_serverId ON scheduled_tasks(serverId);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_appId ON scheduled_tasks(appId);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);

    -- health_check_configs 表索引
    CREATE INDEX IF NOT EXISTS idx_health_check_configs_appId ON health_check_configs(appId);

    -- health_check_history 表索引
    CREATE INDEX IF NOT EXISTS idx_health_check_history_appId ON health_check_history(appId);
    CREATE INDEX IF NOT EXISTS idx_health_check_history_checkTime ON health_check_history(checkTime);
    CREATE INDEX IF NOT EXISTS idx_health_check_history_app_time ON health_check_history(appId, checkTime);

    -- server_group_members 表索引
    CREATE INDEX IF NOT EXISTS idx_server_group_members_serverId ON server_group_members(serverId);

    -- templates 表索引
    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_isBuiltIn ON templates(isBuiltIn);

    -- 复合索引：优化常用查询组合
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action_target ON audit_logs(action, targetType);
    CREATE INDEX IF NOT EXISTS idx_alert_history_rule_status ON alert_history(ruleId, status);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_server_enabled ON scheduled_tasks(serverId, enabled);
    CREATE INDEX IF NOT EXISTS idx_deployment_history_app_status ON deployment_history(appId, status);

    -- 覆盖索引：减少回表查询
    CREATE INDEX IF NOT EXISTS idx_resource_metrics_cover ON resource_metrics(serverId, appId, timestamp, cpuPercent, memoryUsage);
  `)

  migrateAppsTable()
  migrateTemplatesTable()
  log.info('Database tables created/verified')
}

function migrateAppsTable(): void {
  if (!db) return

  try {
    const columns = db.prepare('PRAGMA table_info(apps)').all() as { name: string }[]
    const columnNames = columns.map(c => c.name)

    if (!columnNames.includes('projectPath')) {
      db.exec('ALTER TABLE apps ADD COLUMN projectPath TEXT NOT NULL DEFAULT \'/opt/docker-apps\'')
    }
    if (!columnNames.includes('containerIds')) {
      db.exec('ALTER TABLE apps ADD COLUMN containerIds TEXT DEFAULT \'[]\'')
    }
    if (!columnNames.includes('status')) {
      db.exec('ALTER TABLE apps ADD COLUMN status TEXT DEFAULT \'stopped\'')
    }

    log.info('Apps table migration completed')
  } catch (error) {
    log.error('Apps table migration error:', error)
  }
}

function migrateTemplatesTable(): void {
  if (!db) return

  try {
    const columns = db.prepare('PRAGMA table_info(templates)').all() as { name: string }[]
    const columnNames = columns.map(c => c.name)

    if (!columnNames.includes('category')) {
      db.exec('ALTER TABLE templates ADD COLUMN category TEXT NOT NULL DEFAULT \'app\'')
    }
    if (!columnNames.includes('isBuiltIn')) {
      db.exec('ALTER TABLE templates ADD COLUMN isBuiltIn INTEGER NOT NULL DEFAULT 0')
    }
    if (!columnNames.includes('envSchema')) {
      db.exec('ALTER TABLE templates ADD COLUMN envSchema TEXT DEFAULT \'[]\'')
    }

    log.info('Templates table migration completed')
  } catch (error) {
    log.error('Templates table migration error:', error)
  }
}



const DEFAULT_TEMPLATES = [
  {
    id: 'nginx',
    name: 'Nginx Web Server',
    description: '高性能 HTTP 和反向代理服务器',
    category: 'web',
    dockerCompose: 'version: "3.8"\nservices:\n  nginx:\n    image: nginx:${NGINX_VERSION:-latest}\n    ports:\n      - "${HTTP_PORT:-80}:80"\n      - "${HTTPS_PORT:-443}:443"\n    volumes:\n      - ./conf:/etc/nginx/conf.d\n      - ./html:/usr/share/nginx/html\n      - ./logs:/var/log/nginx\n    restart: unless-stopped',
    envSchema: [
      { name: 'NGINX_VERSION', defaultValue: 'latest', description: 'Nginx 版本', required: false },
      { name: 'HTTP_PORT', defaultValue: '80', description: 'HTTP 端口', required: false },
      { name: 'HTTPS_PORT', defaultValue: '443', description: 'HTTPS 端口', required: false }
    ]
  },
  {
    id: 'mysql',
    name: 'MySQL 数据库',
    description: 'MySQL 8.0 数据库服务器，适合中小型应用数据存储',
    category: 'database',
    dockerCompose: 'version: "3.8"\nservices:\n  mysql:\n    image: mysql:${MYSQL_VERSION:-8.0}\n    ports:\n      - "${MYSQL_PORT:-3306}:3306"\n    environment:\n      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}\n      MYSQL_DATABASE: ${MYSQL_DATABASE:-app}\n      MYSQL_USER: ${MYSQL_USER:-app_user}\n      MYSQL_PASSWORD: ${MYSQL_PASSWORD}\n    volumes:\n      - mysql_data:/var/lib/mysql\n    restart: unless-stopped\n\nvolumes:\n  mysql_data:',
    envSchema: [
      { name: 'MYSQL_VERSION', defaultValue: '8.0', description: 'MySQL 版本', required: false },
      { name: 'MYSQL_PORT', defaultValue: '3306', description: 'MySQL 端口', required: false },
      { name: 'MYSQL_ROOT_PASSWORD', defaultValue: '', description: 'Root 密码', required: true },
      { name: 'MYSQL_DATABASE', defaultValue: 'app', description: '数据库名', required: false },
      { name: 'MYSQL_USER', defaultValue: 'app_user', description: '用户名', required: false },
      { name: 'MYSQL_PASSWORD', defaultValue: '', description: '用户密码', required: true }
    ]
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL 数据库',
    description: 'PostgreSQL 数据库服务器，支持 JSON、地理空间数据等高级特性',
    category: 'database',
    dockerCompose: 'version: "3.8"\nservices:\n  postgres:\n    image: postgres:${POSTGRES_VERSION:-15}\n    ports:\n      - "${POSTGRES_PORT:-5432}:5432"\n    environment:\n      POSTGRES_USER: ${POSTGRES_USER:-postgres}\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n      POSTGRES_DB: ${POSTGRES_DB:-app}\n    volumes:\n      - postgres_data:/var/lib/postgresql/data\n    restart: unless-stopped\n\nvolumes:\n  postgres_data:',
    envSchema: [
      { name: 'POSTGRES_VERSION', defaultValue: '15', description: 'PostgreSQL 版本', required: false },
      { name: 'POSTGRES_PORT', defaultValue: '5432', description: 'PostgreSQL 端口', required: false },
      { name: 'POSTGRES_USER', defaultValue: 'postgres', description: '用户名', required: false },
      { name: 'POSTGRES_PASSWORD', defaultValue: '', description: '密码', required: true },
      { name: 'POSTGRES_DB', defaultValue: 'app', description: '数据库名', required: false }
    ]
  },
  {
    id: 'redis',
    name: 'Redis 缓存',
    description: '高性能键值存储系统，常用于缓存、会话存储等场景',
    category: 'cache',
    dockerCompose: 'version: "3.8"\nservices:\n  redis:\n    image: redis:${REDIS_VERSION:-7}\n    ports:\n      - "${REDIS_PORT:-6379}:6379"\n    volumes:\n      - redis_data:/data\n    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}\n    restart: unless-stopped\n\nvolumes:\n  redis_data:',
    envSchema: [
      { name: 'REDIS_VERSION', defaultValue: '7', description: 'Redis 版本', required: false },
      { name: 'REDIS_PORT', defaultValue: '6379', description: 'Redis 端口', required: false },
      { name: 'REDIS_PASSWORD', defaultValue: '', description: 'Redis 密码', required: false }
    ]
  },
  {
    id: 'wordpress',
    name: 'WordPress CMS',
    description: '最流行的开源内容管理系统，包含 MySQL 数据库',
    category: 'cms',
    dockerCompose: 'version: "3.8"\nservices:\n  wordpress:\n    image: wordpress:${WORDPRESS_VERSION:-latest}\n    ports:\n      - "${WORDPRESS_PORT:-80}:80"\n    environment:\n      WORDPRESS_DB_HOST: db\n      WORDPRESS_DB_USER: ${DB_USER:-wordpress}\n      WORDPRESS_DB_PASSWORD: ${DB_PASSWORD}\n      WORDPRESS_DB_NAME: ${DB_NAME:-wordpress}\n    volumes:\n      - wordpress_data:/var/www/html\n    depends_on:\n      - db\n    restart: unless-stopped\n\n  db:\n    image: mysql:${MYSQL_VERSION:-5.7}\n    environment:\n      MYSQL_DATABASE: ${DB_NAME:-wordpress}\n      MYSQL_USER: ${DB_USER:-wordpress}\n      MYSQL_PASSWORD: ${DB_PASSWORD}\n      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}\n    volumes:\n      - db_data:/var/lib/mysql\n    restart: unless-stopped\n\nvolumes:\n  wordpress_data:\n  db_data:',
    envSchema: [
      { name: 'WORDPRESS_VERSION', defaultValue: 'latest', description: 'WordPress 版本', required: false },
      { name: 'WORDPRESS_PORT', defaultValue: '80', description: 'WordPress 端口', required: false },
      { name: 'MYSQL_VERSION', defaultValue: '5.7', description: 'MySQL 版本', required: false },
      { name: 'DB_USER', defaultValue: 'wordpress', description: '数据库用户名', required: false },
      { name: 'DB_PASSWORD', defaultValue: '', description: '数据库密码', required: true },
      { name: 'DB_NAME', defaultValue: 'wordpress', description: '数据库名', required: false },
      { name: 'DB_ROOT_PASSWORD', defaultValue: '', description: '数据库 Root 密码', required: true }
    ]
  },
  {
    id: 'nginx-php',
    name: 'Nginx + PHP-FPM',
    description: '经典的 Web 开发环境，支持 PHP 应用部署',
    category: 'web',
    dockerCompose: 'version: "3.8"\nservices:\n  web:\n    image: nginx:${NGINX_VERSION:-latest}\n    ports:\n      - "${HTTP_PORT:-80}:80"\n    volumes:\n      - ./nginx.conf:/etc/nginx/nginx.conf\n      - ./www:/var/www/html\n    depends_on:\n      - php\n    restart: unless-stopped\n\n  php:\n    image: php:${PHP_VERSION:-8.2}-fpm\n    volumes:\n      - ./www:/var/www/html\n    environment:\n      PHP_MEMORY_LIMIT: ${PHP_MEMORY_LIMIT:-256M}\n    restart: unless-stopped',
    envSchema: [
      { name: 'NGINX_VERSION', defaultValue: 'latest', description: 'Nginx 版本', required: false },
      { name: 'PHP_VERSION', defaultValue: '8.2', description: 'PHP 版本', required: false },
      { name: 'HTTP_PORT', defaultValue: '80', description: 'HTTP 端口', required: false },
      { name: 'PHP_MEMORY_LIMIT', defaultValue: '256M', description: 'PHP 内存限制', required: false }
    ]
  },
  {
    id: 'mongodb',
    name: 'MongoDB 数据库',
    description: 'MongoDB NoSQL 数据库，支持副本集模式，适合文档存储和大数据应用',
    category: 'database',
    dockerCompose: 'version: "3.8"\nservices:\n  mongodb:\n    image: mongo:${MONGO_VERSION:-7}\n    ports:\n      - "${MONGO_PORT:-27017}:27017"\n    environment:\n      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME:-admin}\n      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}\n    volumes:\n      - mongo_data:/data/db\n      - mongo_config:/data/configdb\n    restart: unless-stopped\n\nvolumes:\n  mongo_data:\n  mongo_config:',
    envSchema: [
      { name: 'MONGO_VERSION', defaultValue: '7', description: 'MongoDB 版本', required: false },
      { name: 'MONGO_PORT', defaultValue: '27017', description: 'MongoDB 端口', required: false },
      { name: 'MONGO_ROOT_USERNAME', defaultValue: 'admin', description: 'Root 用户名', required: false },
      { name: 'MONGO_ROOT_PASSWORD', defaultValue: '', description: 'Root 密码', required: true }
    ]
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ 消息队列',
    description: 'RabbitMQ 消息代理，支持 AMQP 协议，包含管理控制台',
    category: 'message-queue',
    dockerCompose: 'version: "3.8"\nservices:\n  rabbitmq:\n    image: rabbitmq:${RABBITMQ_VERSION:-3.13}-management\n    ports:\n      - "${AMQP_PORT:-5672}:5672"\n      - "${MANAGEMENT_PORT:-15672}:15672"\n    environment:\n      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-admin}\n      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}\n    volumes:\n      - rabbitmq_data:/var/lib/rabbitmq\n    restart: unless-stopped\n\nvolumes:\n  rabbitmq_data:',
    envSchema: [
      { name: 'RABBITMQ_VERSION', defaultValue: '3.13', description: 'RabbitMQ 版本', required: false },
      { name: 'AMQP_PORT', defaultValue: '5672', description: 'AMQP 端口', required: false },
      { name: 'MANAGEMENT_PORT', defaultValue: '15672', description: '管理控制台端口', required: false },
      { name: 'RABBITMQ_USER', defaultValue: 'admin', description: '用户名', required: false },
      { name: 'RABBITMQ_PASSWORD', defaultValue: '', description: '密码', required: true }
    ]
  },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch 搜索引擎',
    description: 'Elasticsearch 分布式搜索和分析引擎，适合全文搜索和日志分析',
    category: 'search',
    dockerCompose: 'version: "3.8"\nservices:\n  elasticsearch:\n    image: elasticsearch:${ES_VERSION:-8.11.0}\n    ports:\n      - "${ES_HTTP_PORT:-9200}:9200"\n      - "${ES_TRANSPORT_PORT:-9300}:9300"\n    environment:\n      discovery.type: single-node\n      xpack.security.enabled: "false"\n      ES_JAVA_OPTS: "-Xms512m -Xmx512m"\n    volumes:\n      - es_data:/usr/share/elasticsearch/data\n    restart: unless-stopped\n\nvolumes:\n  es_data:',
    envSchema: [
      { name: 'ES_VERSION', defaultValue: '8.11.0', description: 'Elasticsearch 版本', required: false },
      { name: 'ES_HTTP_PORT', defaultValue: '9200', description: 'HTTP API 端口', required: false },
      { name: 'ES_TRANSPORT_PORT', defaultValue: '9300', description: '传输端口', required: false }
    ]
  },
  {
    id: 'grafana',
    name: 'Grafana 监控面板',
    description: 'Grafana 开源可视化和分析平台，支持多种数据源',
    category: 'monitoring',
    dockerCompose: 'version: "3.8"\nservices:\n  grafana:\n    image: grafana/grafana:${GRAFANA_VERSION:-10.2.0}\n    ports:\n      - "${GRAFANA_PORT:-3000}:3000"\n    environment:\n      GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}\n      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-admin}\n    volumes:\n      - grafana_data:/var/lib/grafana\n    restart: unless-stopped\n\nvolumes:\n  grafana_data:',
    envSchema: [
      { name: 'GRAFANA_VERSION', defaultValue: '10.2.0', description: 'Grafana 版本', required: false },
      { name: 'GRAFANA_PORT', defaultValue: '3000', description: 'Grafana 端口', required: false },
      { name: 'GRAFANA_ADMIN_USER', defaultValue: 'admin', description: '管理员用户名', required: false },
      { name: 'GRAFANA_ADMIN_PASSWORD', defaultValue: 'admin', description: '管理员密码', required: false }
    ]
  },
  {
    id: 'prometheus',
    name: 'Prometheus 监控系统',
    description: 'Prometheus 监控和告警系统，支持时序数据收集',
    category: 'monitoring',
    dockerCompose: 'version: "3.8"\nservices:\n  prometheus:\n    image: prom/prometheus:${PROMETHEUS_VERSION:-v2.48.0}\n    ports:\n      - "${PROMETHEUS_PORT:-9090}:9090"\n    volumes:\n      - ./prometheus.yml:/etc/prometheus/prometheus.yml\n      - prometheus_data:/prometheus\n    command:\n      - --config.file=/etc/prometheus/prometheus.yml\n      - --storage.tsdb.retention.time=15d\n    restart: unless-stopped\n\nvolumes:\n  prometheus_data:',
    envSchema: [
      { name: 'PROMETHEUS_VERSION', defaultValue: 'v2.48.0', description: 'Prometheus 版本', required: false },
      { name: 'PROMETHEUS_PORT', defaultValue: '9090', description: 'Prometheus 端口', required: false }
    ]
  },
  {
    id: 'jenkins',
    name: 'Jenkins CI/CD',
    description: 'Jenkins 自动化服务器，用于持续集成和持续交付',
    category: 'ci-cd',
    dockerCompose: 'version: "3.8"\nservices:\n  jenkins:\n    image: jenkins/jenkins:${JENKINS_VERSION:-lts}\n    ports:\n      - "${JENKINS_PORT:-8080}:8080"\n      - "${JENKINS_AGENT_PORT:-50000}:50000"\n    environment:\n      JAVA_OPTS: "-Djenkins.install.runSetupWizard=false"\n    volumes:\n      - jenkins_data:/var/jenkins_home\n    restart: unless-stopped\n\nvolumes:\n  jenkins_data:',
    envSchema: [
      { name: 'JENKINS_VERSION', defaultValue: 'lts', description: 'Jenkins 版本', required: false },
      { name: 'JENKINS_PORT', defaultValue: '8080', description: 'Web 端口', required: false },
      { name: 'JENKINS_AGENT_PORT', defaultValue: '50000', description: 'Agent 端口', required: false }
    ]
  },
  {
    id: 'gitlab',
    name: 'GitLab 代码仓库',
    description: 'GitLab 完整的 DevOps 平台，包含代码托管、CI/CD、容器仓库',
    category: 'devops',
    dockerCompose: 'version: "3.8"\nservices:\n  gitlab:\n    image: gitlab/gitlab-ce:${GITLAB_VERSION:-latest}\n    hostname: gitlab.local\n    ports:\n      - "${GITLAB_HTTP_PORT:-80}:80"\n      - "${GITLAB_HTTPS_PORT:-443}:443"\n      - "${GITLAB_SSH_PORT:-22}:22"\n    environment:\n      GITLAB_OMNIBUS_CONFIG: |\n        external_url \'http://localhost\'\n        gitlab_rails[\'gitlab_shell_ssh_port\'] = ${GITLAB_SSH_PORT:-22}\n    volumes:\n      - gitlab_config:/etc/gitlab\n      - gitlab_logs:/var/log/gitlab\n      - gitlab_data:/var/opt/gitlab\n    restart: unless-stopped\n\nvolumes:\n  gitlab_config:\n  gitlab_logs:\n  gitlab_data:',
    envSchema: [
      { name: 'GITLAB_VERSION', defaultValue: 'latest', description: 'GitLab 版本', required: false },
      { name: 'GITLAB_HTTP_PORT', defaultValue: '80', description: 'HTTP 端口', required: false },
      { name: 'GITLAB_HTTPS_PORT', defaultValue: '443', description: 'HTTPS 端口', required: false },
      { name: 'GITLAB_SSH_PORT', defaultValue: '22', description: 'SSH 端口', required: false }
    ]
  },
  {
    id: 'portainer',
    name: 'Portainer 容器管理',
    description: 'Portainer 轻量级 Docker 管理界面，支持容器、镜像、网络管理',
    category: 'devops',
    dockerCompose: 'version: "3.8"\nservices:\n  portainer:\n    image: portainer/portainer-ce:${PORTAINER_VERSION:-2.19.0}\n    ports:\n      - "${PORTAINER_PORT:-9000}:9000"\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n      - portainer_data:/data\n    restart: unless-stopped\n\nvolumes:\n  portainer_data:',
    envSchema: [
      { name: 'PORTAINER_VERSION', defaultValue: '2.19.0', description: 'Portainer 版本', required: false },
      { name: 'PORTAINER_PORT', defaultValue: '9000', description: 'Web 端口', required: false }
    ]
  },
  {
    id: 'minio',
    name: 'MinIO 对象存储',
    description: 'MinIO 高性能对象存储，兼容 S3 API，适合文件存储和备份',
    category: 'storage',
    dockerCompose: 'version: "3.8"\nservices:\n  minio:\n    image: minio/minio:${MINIO_VERSION:-latest}\n    ports:\n      - "${MINIO_API_PORT:-9000}:9000"\n      - "${MINIO_CONSOLE_PORT:-9001}:9001"\n    environment:\n      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}\n      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}\n    volumes:\n      - minio_data:/data\n    command: server /data --console-address ":9001"\n    restart: unless-stopped\n\nvolumes:\n  minio_data:',
    envSchema: [
      { name: 'MINIO_VERSION', defaultValue: 'latest', description: 'MinIO 版本', required: false },
      { name: 'MINIO_API_PORT', defaultValue: '9000', description: 'API 端口', required: false },
      { name: 'MINIO_CONSOLE_PORT', defaultValue: '9001', description: '控制台端口', required: false },
      { name: 'MINIO_ROOT_USER', defaultValue: 'minioadmin', description: 'Root 用户名', required: false },
      { name: 'MINIO_ROOT_PASSWORD', defaultValue: '', description: 'Root 密码（至少8位）', required: true }
    ]
  },
  {
    id: 'nginx-proxy-manager',
    name: 'Nginx Proxy Manager',
    description: 'Nginx 反向代理管理器，提供友好的 Web 界面管理反向代理和 SSL 证书',
    category: 'proxy',
    dockerCompose: 'version: "3.8"\nservices:\n  npm:\n    image: jc21/nginx-proxy-manager:${NPM_VERSION:-latest}\n    ports:\n      - "${NPM_HTTP_PORT:-80}:80"\n      - "${NPM_HTTPS_PORT:-443}:443"\n      - "${NPM_ADMIN_PORT:-81}:81"\n    volumes:\n      - npm_data:/data\n      - npm_letsencrypt:/etc/letsencrypt\n    restart: unless-stopped\n\nvolumes:\n  npm_data:\n  npm_letsencrypt:',
    envSchema: [
      { name: 'NPM_VERSION', defaultValue: 'latest', description: 'NPM 版本', required: false },
      { name: 'NPM_HTTP_PORT', defaultValue: '80', description: 'HTTP 端口', required: false },
      { name: 'NPM_HTTPS_PORT', defaultValue: '443', description: 'HTTPS 端口', required: false },
      { name: 'NPM_ADMIN_PORT', defaultValue: '81', description: '管理端口', required: false }
    ]
  },
  {
    id: 'lamp-stack',
    name: 'LAMP 应用栈',
    description: '经典 LAMP 栈：Linux + Apache + MySQL + PHP，适合传统 Web 应用部署',
    category: 'stack',
    dockerCompose: 'version: "3.8"\nservices:\n  apache:\n    image: php:${PHP_VERSION:-8.2}-apache\n    ports:\n      - "${APACHE_PORT:-80}:80"\n    volumes:\n      - ./www:/var/www/html\n    depends_on:\n      - mysql\n    restart: unless-stopped\n\n  mysql:\n    image: mysql:${MYSQL_VERSION:-8.0}\n    ports:\n      - "${MYSQL_PORT:-3306}:3306"\n    environment:\n      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}\n      MYSQL_DATABASE: ${MYSQL_DATABASE:-app}\n      MYSQL_USER: ${MYSQL_USER:-app_user}\n      MYSQL_PASSWORD: ${MYSQL_PASSWORD}\n    volumes:\n      - mysql_data:/var/lib/mysql\n    restart: unless-stopped\n\nvolumes:\n  mysql_data:',
    envSchema: [
      { name: 'PHP_VERSION', defaultValue: '8.2', description: 'PHP 版本', required: false },
      { name: 'MYSQL_VERSION', defaultValue: '8.0', description: 'MySQL 版本', required: false },
      { name: 'APACHE_PORT', defaultValue: '80', description: 'Apache 端口', required: false },
      { name: 'MYSQL_PORT', defaultValue: '3306', description: 'MySQL 端口', required: false },
      { name: 'MYSQL_ROOT_PASSWORD', defaultValue: '', description: 'MySQL Root 密码', required: true },
      { name: 'MYSQL_DATABASE', defaultValue: 'app', description: '数据库名', required: false },
      { name: 'MYSQL_USER', defaultValue: 'app_user', description: '数据库用户名', required: false },
      { name: 'MYSQL_PASSWORD', defaultValue: '', description: '数据库用户密码', required: true }
    ]
  },
  {
    id: 'elk-stack',
    name: 'ELK 日志分析栈',
    description: 'ELK 栈：Elasticsearch + Logstash + Kibana，用于日志收集、存储和可视化分析',
    category: 'stack',
    dockerCompose: 'version: "3.8"\nservices:\n  elasticsearch:\n    image: elasticsearch:${ES_VERSION:-8.11.0}\n    ports:\n      - "${ES_HTTP_PORT:-9200}:9200"\n    environment:\n      discovery.type: single-node\n      xpack.security.enabled: "false"\n      ES_JAVA_OPTS: "-Xms512m -Xmx512m"\n    volumes:\n      - es_data:/usr/share/elasticsearch/data\n    restart: unless-stopped\n\n  logstash:\n    image: logstash:${ES_VERSION:-8.11.0}\n    ports:\n      - "${LOGSTASH_PORT:-5044}:5044"\n    environment:\n      LS_JAVA_OPTS: "-Xms256m -Xmx256m"\n    volumes:\n      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf\n    depends_on:\n      - elasticsearch\n    restart: unless-stopped\n\n  kibana:\n    image: kibana:${ES_VERSION:-8.11.0}\n    ports:\n      - "${KIBANA_PORT:-5601}:5601"\n    environment:\n      ELASTICSEARCH_HOSTS: \'["http://elasticsearch:9200"]\'\n    depends_on:\n      - elasticsearch\n    restart: unless-stopped\n\nvolumes:\n  es_data:',
    envSchema: [
      { name: 'ES_VERSION', defaultValue: '8.11.0', description: 'ELK 版本', required: false },
      { name: 'ES_HTTP_PORT', defaultValue: '9200', description: 'Elasticsearch 端口', required: false },
      { name: 'LOGSTASH_PORT', defaultValue: '5044', description: 'Logstash 端口', required: false },
      { name: 'KIBANA_PORT', defaultValue: '5601', description: 'Kibana 端口', required: false }
    ]
  },
  {
    id: 'prometheus-grafana-stack',
    name: 'Prometheus + Grafana 监控栈',
    description: '完整的监控解决方案：Prometheus 指标收集 + Grafana 可视化面板',
    category: 'stack',
    dockerCompose: 'version: "3.8"\nservices:\n  prometheus:\n    image: prom/prometheus:${PROMETHEUS_VERSION:-v2.48.0}\n    ports:\n      - "${PROMETHEUS_PORT:-9090}:9090"\n    volumes:\n      - ./prometheus.yml:/etc/prometheus/prometheus.yml\n      - prometheus_data:/prometheus\n    command:\n      - --config.file=/etc/prometheus/prometheus.yml\n      - --storage.tsdb.retention.time=15d\n    restart: unless-stopped\n\n  grafana:\n    image: grafana/grafana:${GRAFANA_VERSION:-10.2.0}\n    ports:\n      - "${GRAFANA_PORT:-3000}:3000"\n    environment:\n      GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}\n      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-admin}\n    volumes:\n      - grafana_data:/var/lib/grafana\n    depends_on:\n      - prometheus\n    restart: unless-stopped\n\nvolumes:\n  prometheus_data:\n  grafana_data:',
    envSchema: [
      { name: 'PROMETHEUS_VERSION', defaultValue: 'v2.48.0', description: 'Prometheus 版本', required: false },
      { name: 'GRAFANA_VERSION', defaultValue: '10.2.0', description: 'Grafana 版本', required: false },
      { name: 'PROMETHEUS_PORT', defaultValue: '9090', description: 'Prometheus 端口', required: false },
      { name: 'GRAFANA_PORT', defaultValue: '3000', description: 'Grafana 端口', required: false },
      { name: 'GRAFANA_ADMIN_USER', defaultValue: 'admin', description: 'Grafana 管理员用户名', required: false },
      { name: 'GRAFANA_ADMIN_PASSWORD', defaultValue: 'admin', description: 'Grafana 管理员密码', required: false }
    ]
  }
]

export function initDefaultTemplates(): void {
  if (!db) return

  const database = db
  const now = new Date().toISOString()
  
  const insertStmt = database.prepare(`
    INSERT OR REPLACE INTO templates (id, name, description, category, dockerCompose, isBuiltIn, envSchema, createdAt, updatedAt)
    VALUES (@id, @name, @description, @category, @dockerCompose, @isBuiltIn, @envSchema, @createdAt, @updatedAt)
  `)

  const insertMany = database.transaction(() => {
    for (const tpl of DEFAULT_TEMPLATES) {
      const existing = database.prepare('SELECT createdAt FROM templates WHERE id = ?').get(tpl.id) as { createdAt?: string }
      insertStmt.run({
        ...tpl,
        envSchema: JSON.stringify(tpl.envSchema),
        isBuiltIn: 1,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      })
    }
  })

  insertMany()
  log.info(`Initialized/updated ${DEFAULT_TEMPLATES.length} default templates in database`)
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    log.info('Database closed')
  }
}

export interface ServerRow {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password: string | null
  privateKey: string | null
  status: 'online' | 'offline' | 'connecting' | 'error'
  createdAt: string
  updatedAt: string
}

export interface EnvVariableSchema {
  name: string
  defaultValue?: string
  description?: string
  required?: boolean
}

export interface TemplateRow {
  id: string
  name: string
  description: string | null
  category: string
  dockerCompose: string
  isBuiltIn: number
  envSchema: string
  createdAt: string
  updatedAt: string
}

export interface AppRow {
  id: string
  name: string
  templateId: string
  serverId: string
  projectPath: string
  status: 'running' | 'stopped' | 'deploying' | 'error'
  containerIds: string
  createdAt: string
  updatedAt: string
}

export const serverQueries = {
  getAll: (): ServerRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM servers ORDER BY createdAt DESC').all() as ServerRow[]
  },

  getById: (id: string): ServerRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as ServerRow | undefined
  },

  insert: (server: Omit<ServerRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO servers (id, name, host, port, username, authType, password, privateKey, status, createdAt, updatedAt)
      VALUES (@id, @name, @host, @port, @username, @authType, @password, @privateKey, @status, @createdAt, @updatedAt)
    `).run({
      ...server,
      password: server.password || null,
      privateKey: server.privateKey || null,
      createdAt: now,
      updatedAt: now
    })
  },

  update: (id: string, updates: Partial<ServerRow>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `${key} = @${key}`)
      .join(', ')
    
    if (fields) {
      db.prepare(`UPDATE servers SET ${fields}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...updates, id, updatedAt: now })
    }
  },

  updateStatus: (id: string, status: ServerRow['status']): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE servers SET status = ?, updatedAt = ? WHERE id = ?')
      .run(status, now, id)
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM servers WHERE id = ?').run(id)
  }
}

export const templateQueries = {
  getAll: (): TemplateRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM templates ORDER BY createdAt DESC').all() as TemplateRow[]
  },

  getById: (id: string): TemplateRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined
  },

  insert: (template: Omit<TemplateRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO templates (id, name, description, category, dockerCompose, isBuiltIn, envSchema, createdAt, updatedAt)
      VALUES (@id, @name, @description, @category, @dockerCompose, @isBuiltIn, @envSchema, @createdAt, @updatedAt)
    `).run({ ...template, envSchema: template.envSchema || '[]', createdAt: now, updatedAt: now })
  },

  update: (id: string, updates: Partial<TemplateRow>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `${key} = @${key}`)
      .join(', ')
    
    if (fields) {
      db.prepare(`UPDATE templates SET ${fields}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...updates, id, updatedAt: now })
    }
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  }
}

export const appQueries = {
  getAll: (): AppRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM apps ORDER BY createdAt DESC').all() as AppRow[]
  },

  getById: (id: string): AppRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM apps WHERE id = ?').get(id) as AppRow | undefined
  },

  getByServerId: (serverId: string): AppRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM apps WHERE serverId = ? ORDER BY createdAt DESC').all(serverId) as AppRow[]
  },

  insert: (app: Omit<AppRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO apps (id, name, templateId, serverId, projectPath, status, containerIds, createdAt, updatedAt)
      VALUES (@id, @name, @templateId, @serverId, @projectPath, @status, @containerIds, @createdAt, @updatedAt)
    `).run({ ...app, createdAt: now, updatedAt: now })
  },

  update: (id: string, updates: Partial<AppRow>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `${key} = @${key}`)
      .join(', ')
    
    if (fields) {
      db.prepare(`UPDATE apps SET ${fields}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...updates, id, updatedAt: now })
    }
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM apps WHERE id = ?').run(id)
  }
}

export interface AuditLogRow {
  id: string
  timestamp: string
  action: string
  targetType: string
  targetId: string | null
  targetName: string | null
  status: string
  details: string | null
  serverId: string | null
  createdAt: string
}

export interface AuditLogQuery {
  action?: string
  targetType?: string
  status?: string
  serverId?: string
  startDate?: string
  endDate?: string
  search?: string
  limit?: number
  offset?: number
}

export const auditLogQueries = {
  insert: (log: Omit<AuditLogRow, 'createdAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, action, targetType, targetId, targetName, status, details, serverId, createdAt)
      VALUES (@id, @timestamp, @action, @targetType, @targetId, @targetName, @status, @details, @serverId, @createdAt)
    `).run({ ...log, createdAt: now })
  },

  query: (query: AuditLogQuery): { logs: AuditLogRow[]; total: number } => {
    const db = getDatabase()
    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    if (query.action) {
      conditions.push('action = @action')
      params.action = query.action
    }
    if (query.targetType) {
      conditions.push('targetType = @targetType')
      params.targetType = query.targetType
    }
    if (query.status) {
      conditions.push('status = @status')
      params.status = query.status
    }
    if (query.serverId) {
      conditions.push('serverId = @serverId')
      params.serverId = query.serverId
    }
    if (query.startDate) {
      conditions.push('timestamp >= @startDate')
      params.startDate = query.startDate
    }
    if (query.endDate) {
      conditions.push('timestamp <= @endDate')
      params.endDate = query.endDate
    }
    if (query.search) {
      conditions.push('(targetName LIKE @search OR details LIKE @search OR action LIKE @search)')
      params.search = `%${query.search}%`
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`).get(params) as { count: number }
    const total = countRow.count

    const limit = query.limit || 50
    const offset = query.offset || 0
    const logs = db.prepare(`
      SELECT * FROM audit_logs ${whereClause}
      ORDER BY timestamp DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset }) as AuditLogRow[]

    return { logs, total }
  },

  getById: (id: string): AuditLogRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id) as AuditLogRow | undefined
  },

  deleteBefore: (date: string): number => {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(date)
    return result.changes
  },

  clear: (): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM audit_logs').run()
  },

  getActions: (): string[] => {
    const db = getDatabase()
    const rows = db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action').all() as { action: string }[]
    return rows.map(r => r.action)
  },

  getTargetTypes: (): string[] => {
    const db = getDatabase()
    const rows = db.prepare('SELECT DISTINCT targetType FROM audit_logs ORDER BY targetType').all() as { targetType: string }[]
    return rows.map(r => r.targetType)
  }
}

export interface DeploymentHistoryRow {
  id: string
  appId: string
  appName: string
  serverId: string
  version: number
  dockerCompose: string
  envVariables: string | null
  deployedAt: string
  status: string
}

export const deploymentHistoryQueries = {
  getByAppId: (appId: string): DeploymentHistoryRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM deployment_history WHERE appId = ? ORDER BY version DESC').all(appId) as DeploymentHistoryRow[]
  },

  getById: (id: string): DeploymentHistoryRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM deployment_history WHERE id = ?').get(id) as DeploymentHistoryRow | undefined
  },

  getLatestVersion: (appId: string): number => {
    const db = getDatabase()
    const row = db.prepare('SELECT MAX(version) as maxVersion FROM deployment_history WHERE appId = ?').get(appId) as { maxVersion: number | null }
    return row.maxVersion || 0
  },

  insert: (record: Omit<DeploymentHistoryRow, 'id'>): DeploymentHistoryRow => {
    const db = getDatabase()
    const id = randomUUID()
    db.prepare(`
      INSERT INTO deployment_history (id, appId, appName, serverId, version, dockerCompose, envVariables, deployedAt, status)
      VALUES (@id, @appId, @appName, @serverId, @version, @dockerCompose, @envVariables, @deployedAt, @status)
    `).run({ ...record, id })
    return { ...record, id }
  },

  deleteByAppId: (appId: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM deployment_history WHERE appId = ?').run(appId)
  },

  getAll: (): DeploymentHistoryRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM deployment_history ORDER BY deployedAt DESC').all() as DeploymentHistoryRow[]
  }
}

export interface ConfigExportData {
  version: string
  exportTime: string
  servers: ServerRow[]
  templates: TemplateRow[]
  apps: AppRow[]
}

export interface ConfigImportResult {
  success: boolean
  message: string
  serversImported: number
  templatesImported: number
  appsImported: number
}

function validateConfigData(data: unknown): data is ConfigExportData {
  if (!data || typeof data !== 'object') return false
  const config = data as Record<string, unknown>
  if (typeof config.version !== 'string') return false
  if (typeof config.exportTime !== 'string') return false
  if (!Array.isArray(config.servers)) return false
  if (!Array.isArray(config.templates)) return false
  if (!Array.isArray(config.apps)) return false
  return true
}

export const configQueries = {
  exportConfig: (): ConfigExportData => {
    const servers = serverQueries.getAll()
    const templates = templateQueries.getAll()
    const apps = appQueries.getAll()
    return {
      version: '1.0.0',
      exportTime: new Date().toISOString(),
      servers,
      templates,
      apps
    }
  },

  importConfig: (data: unknown): ConfigImportResult => {
    if (!validateConfigData(data)) {
      return {
        success: false,
        message: '配置文件格式无效，缺少必要字段',
        serversImported: 0,
        templatesImported: 0,
        appsImported: 0
      }
    }

    const db = getDatabase()
    let serversImported = 0
    let templatesImported = 0
    let appsImported = 0

    const importTransaction = db.transaction(() => {
      // 导入服务器配置
      for (const server of data.servers) {
        if (!server.id || !server.name || !server.host) continue
        const existing = db.prepare('SELECT id FROM servers WHERE id = ?').get(server.id)
        if (existing) {
          db.prepare(`
            UPDATE servers SET name = @name, host = @host, port = @port, username = @username,
            authType = @authType, password = @password, privateKey = @privateKey, updatedAt = @updatedAt
            WHERE id = @id
          `).run({
            ...server,
            updatedAt: new Date().toISOString()
          })
        } else {
          db.prepare(`
            INSERT INTO servers (id, name, host, port, username, authType, password, privateKey, status, createdAt, updatedAt)
            VALUES (@id, @name, @host, @port, @username, @authType, @password, @privateKey, @status, @createdAt, @updatedAt)
          `).run({
            ...server,
            status: 'offline',
            updatedAt: new Date().toISOString()
          })
        }
        serversImported++
      }

      // 导入模板配置（跳过内置模板）
      for (const template of data.templates) {
        if (!template.id || !template.name || !template.dockerCompose) continue
        const existing = db.prepare('SELECT id, isBuiltIn FROM templates WHERE id = ?').get(template.id) as { isBuiltIn?: number } | undefined
        if (existing?.isBuiltIn === 1) continue
        if (existing) {
          db.prepare(`
            UPDATE templates SET name = @name, description = @description, category = @category,
            dockerCompose = @dockerCompose, envSchema = @envSchema, updatedAt = @updatedAt
            WHERE id = @id
          `).run({
            ...template,
            isBuiltIn: existing.isBuiltIn || 0,
            updatedAt: new Date().toISOString()
          })
        } else {
          db.prepare(`
            INSERT INTO templates (id, name, description, category, dockerCompose, isBuiltIn, envSchema, createdAt, updatedAt)
            VALUES (@id, @name, @description, @category, @dockerCompose, @isBuiltIn, @envSchema, @createdAt, @updatedAt)
          `).run({
            ...template,
            isBuiltIn: 0,
            updatedAt: new Date().toISOString()
          })
        }
        templatesImported++
      }

      // 导入应用配置
      for (const app of data.apps) {
        if (!app.id || !app.name || !app.templateId || !app.serverId) continue
        const existing = db.prepare('SELECT id FROM apps WHERE id = ?').get(app.id)
        if (existing) {
          db.prepare(`
            UPDATE apps SET name = @name, templateId = @templateId, serverId = @serverId,
            projectPath = @projectPath, containerIds = @containerIds, updatedAt = @updatedAt
            WHERE id = @id
          `).run({
            ...app,
            status: 'stopped',
            updatedAt: new Date().toISOString()
          })
        } else {
          db.prepare(`
            INSERT INTO apps (id, name, templateId, serverId, projectPath, status, containerIds, createdAt, updatedAt)
            VALUES (@id, @name, @templateId, @serverId, @projectPath, @status, @containerIds, @createdAt, @updatedAt)
          `).run({
            ...app,
            status: 'stopped',
            updatedAt: new Date().toISOString()
          })
        }
        appsImported++
      }
    })

    try {
      importTransaction()
      return {
        success: true,
        message: `成功导入 ${serversImported} 个服务器、${templatesImported} 个模板、${appsImported} 个应用`,
        serversImported,
        templatesImported,
        appsImported
      }
    } catch (error) {
      return {
        success: false,
        message: `导入失败: ${(error as Error).message}`,
        serversImported,
        templatesImported,
        appsImported
      }
    }
  }
}

export interface AlertRuleRow {
  id: string
  name: string
  ruleType: string
  serverId: string | null
  appId: string | null
  threshold: number | null
  enabled: number
  notifyChannels: string
  createdAt: string
  updatedAt: string
}

export interface AlertHistoryRow {
  id: string
  ruleId: string
  ruleName: string
  alertType: string
  message: string
  severity: string
  status: string
  triggeredAt: string
  resolvedAt: string | null
}

export const alertRuleQueries = {
  getAll: (): AlertRuleRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM alert_rules ORDER BY createdAt DESC').all() as AlertRuleRow[]
  },

  getById: (id: string): AlertRuleRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as AlertRuleRow | undefined
  },

  getEnabled: (): AlertRuleRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM alert_rules WHERE enabled = 1').all() as AlertRuleRow[]
  },

  insert: (rule: Omit<AlertRuleRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO alert_rules (id, name, ruleType, serverId, appId, threshold, enabled, notifyChannels, createdAt, updatedAt)
      VALUES (@id, @name, @ruleType, @serverId, @appId, @threshold, @enabled, @notifyChannels, @createdAt, @updatedAt)
    `).run({ ...rule, createdAt: now, updatedAt: now })
  },

  update: (id: string, updates: Partial<AlertRuleRow>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `${key} = @${key}`)
      .join(', ')
    
    if (fields) {
      db.prepare(`UPDATE alert_rules SET ${fields}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...updates, id, updatedAt: now })
    }
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM alert_rules WHERE id = ?').run(id)
  }
}

export const alertHistoryQueries = {
  getAll: (limit?: number): AlertHistoryRow[] => {
    const db = getDatabase()
    const sql = `SELECT * FROM alert_history ORDER BY triggeredAt DESC ${limit ? 'LIMIT ?' : ''}`
    return limit ? db.prepare(sql).all(limit) as AlertHistoryRow[] : db.prepare(sql).all() as AlertHistoryRow[]
  },

  getById: (id: string): AlertHistoryRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM alert_history WHERE id = ?').get(id) as AlertHistoryRow | undefined
  },

  getActive: (): AlertHistoryRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM alert_history WHERE status = ? ORDER BY triggeredAt DESC').all('active') as AlertHistoryRow[]
  },

  getByRuleId: (ruleId: string): AlertHistoryRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM alert_history WHERE ruleId = ? ORDER BY triggeredAt DESC').all(ruleId) as AlertHistoryRow[]
  },

  insert: (alert: Omit<AlertHistoryRow, 'id'>): AlertHistoryRow => {
    const db = getDatabase()
    const id = randomUUID()
    db.prepare(`
      INSERT INTO alert_history (id, ruleId, ruleName, alertType, message, severity, status, triggeredAt, resolvedAt)
      VALUES (@id, @ruleId, @ruleName, @alertType, @message, @severity, @status, @triggeredAt, @resolvedAt)
    `).run({ ...alert, id })
    return { ...alert, id }
  },

  resolve: (id: string): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE alert_history SET status = ?, resolvedAt = ? WHERE id = ?').run('resolved', now, id)
  },

  resolveAll: (): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE alert_history SET status = ?, resolvedAt = ? WHERE status = ?').run('resolved', now, 'active')
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM alert_history WHERE id = ?').run(id)
  },

  clear: (): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM alert_history').run()
  },

  deleteBefore: (date: string): number => {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM alert_history WHERE triggeredAt < ?').run(date)
    return result.changes
  }
}

export interface ScheduledTaskRow {
  id: string
  name: string
  description: string | null
  taskType: string
  cronExpression: string
  serverId: string
  appId: string | null
  enabled: number
  lastRun: string | null
  lastStatus: string | null
  createdAt: string
  updatedAt: string
}

export const scheduledTaskQueries = {
  getAll: (): ScheduledTaskRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM scheduled_tasks ORDER BY createdAt DESC').all() as ScheduledTaskRow[]
  },

  getById: (id: string): ScheduledTaskRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as ScheduledTaskRow | undefined
  },

  getEnabled: (): ScheduledTaskRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM scheduled_tasks WHERE enabled = 1').all() as ScheduledTaskRow[]
  },

  insert: (task: Omit<ScheduledTaskRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO scheduled_tasks (id, name, description, taskType, cronExpression, serverId, appId, enabled, lastRun, lastStatus, createdAt, updatedAt)
      VALUES (@id, @name, @description, @taskType, @cronExpression, @serverId, @appId, @enabled, @lastRun, @lastStatus, @createdAt, @updatedAt)
    `).run({ ...task, createdAt: now, updatedAt: now })
  },

  update: (id: string, updates: Partial<ScheduledTaskRow>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `${key} = @${key}`)
      .join(', ')
    
    if (fields) {
      db.prepare(`UPDATE scheduled_tasks SET ${fields}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...updates, id, updatedAt: now })
    }
  },

  updateRunStatus: (id: string, lastRun: string, lastStatus: string): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE scheduled_tasks SET lastRun = ?, lastStatus = ?, updatedAt = ? WHERE id = ?')
      .run(lastRun, lastStatus, now, id)
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id)
  }
}

export interface HealthCheckConfigRow {
  id: string
  appId: string
  autoRestart: number
  maxRestarts: number
  restartWindow: number
  notifyOnRestart: number
  createdAt: string
  updatedAt: string
}

export interface HealthCheckHistoryRow {
  id: string
  appId: string
  containerId: string | null
  containerName: string | null
  checkTime: string
  status: string
  healthStatus: string | null
  restartCount: number
  autoRestarted: number
  errorMessage: string | null
  responseTime: number | null
  createdAt: string
}

export const healthCheckConfigQueries = {
  getByAppId: (appId: string): HealthCheckConfigRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM health_check_configs WHERE appId = ?').get(appId) as HealthCheckConfigRow | undefined
  },

  getAll: (): HealthCheckConfigRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM health_check_configs ORDER BY createdAt DESC').all() as HealthCheckConfigRow[]
  },

  insert: (config: Omit<HealthCheckConfigRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO health_check_configs (id, appId, autoRestart, maxRestarts, restartWindow, notifyOnRestart, createdAt, updatedAt)
      VALUES (@id, @appId, @autoRestart, @maxRestarts, @restartWindow, @notifyOnRestart, @createdAt, @updatedAt)
    `).run({ ...config, createdAt: now, updatedAt: now })
  },

  update: (appId: string, updates: Partial<Omit<HealthCheckConfigRow, 'id' | 'appId' | 'createdAt'>>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .map(key => `${key} = @${key}`)
      .join(', ')
    
    if (fields) {
      db.prepare(`UPDATE health_check_configs SET ${fields}, updatedAt = @updatedAt WHERE appId = @appId`)
        .run({ ...updates, appId, updatedAt: now })
    }
  },

  delete: (appId: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM health_check_configs WHERE appId = ?').run(appId)
  },

  deleteById: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM health_check_configs WHERE id = ?').run(id)
  }
}

export const healthCheckHistoryQueries = {
  getByAppId: (appId: string, limit?: number): HealthCheckHistoryRow[] => {
    const db = getDatabase()
    const sql = `SELECT * FROM health_check_history WHERE appId = ? ORDER BY checkTime DESC ${limit ? 'LIMIT ?' : ''}`
    return limit ? db.prepare(sql).all(appId, limit) as HealthCheckHistoryRow[] : db.prepare(sql).all(appId) as HealthCheckHistoryRow[]
  },

  getById: (id: string): HealthCheckHistoryRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM health_check_history WHERE id = ?').get(id) as HealthCheckHistoryRow | undefined
  },

  insert: (record: Omit<HealthCheckHistoryRow, 'id' | 'createdAt'>): HealthCheckHistoryRow => {
    const db = getDatabase()
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO health_check_history (id, appId, containerId, containerName, checkTime, status, healthStatus, restartCount, autoRestarted, errorMessage, responseTime, createdAt)
      VALUES (@id, @appId, @containerId, @containerName, @checkTime, @status, @healthStatus, @restartCount, @autoRestarted, @errorMessage, @responseTime, @createdAt)
    `).run({ ...record, id, createdAt: now })
    return { ...record, id, createdAt: now }
  },

  deleteBefore: (date: string): number => {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM health_check_history WHERE checkTime < ?').run(date)
    return result.changes
  },

  clear: (): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM health_check_history').run()
  },

  getRecentRestarts: (appId: string, windowSeconds: number): number => {
    const db = getDatabase()
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString()
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM health_check_history 
      WHERE appId = ? AND autoRestarted = 1 AND checkTime >= ?
    `).get(appId, windowStart) as { count: number }
    return row.count
  },

  getStats: (appId: string): { total: number; healthy: number; unhealthy: number; restarted: number } => {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy,
        SUM(CASE WHEN status = 'unhealthy' THEN 1 ELSE 0 END) as unhealthy,
        SUM(CASE WHEN autoRestarted = 1 THEN 1 ELSE 0 END) as restarted
      FROM health_check_history 
      WHERE appId = ?
    `).get(appId) as { total: number; healthy: number; unhealthy: number; restarted: number }
    return row
  }
}

export interface ResourceMetricRow {
  id: string
  serverId: string
  appId: string | null
  containerId: string | null
  cpuPercent: number | null
  memoryUsage: number | null
  memoryLimit: number | null
  networkRx: number | null
  networkTx: number | null
  blockRead: number | null
  blockWrite: number | null
  timestamp: string
}

export interface ResourceMetricsQuery {
  serverId?: string
  appId?: string
  containerId?: string
  startTime?: string
  endTime?: string
  limit?: number
  offset?: number
}

export interface MetricsSummary {
  avgCpuPercent: number
  maxCpuPercent: number
  avgMemoryUsage: number
  maxMemoryUsage: number
  avgNetworkRx: number
  avgNetworkTx: number
  totalBlockRead: number
  totalBlockWrite: number
  dataPoints: number
  period: string
}

export const resourceMetricQueries = {
  insert: (metric: Omit<ResourceMetricRow, 'id'>): void => {
    const db = getDatabase()
    const id = randomUUID()
    db.prepare(`
      INSERT INTO resource_metrics (id, serverId, appId, containerId, cpuPercent, memoryUsage, memoryLimit, networkRx, networkTx, blockRead, blockWrite, timestamp)
      VALUES (@id, @serverId, @appId, @containerId, @cpuPercent, @memoryUsage, @memoryLimit, @networkRx, @networkTx, @blockRead, @blockWrite, @timestamp)
    `).run({ ...metric, id })
  },

  query: (query: ResourceMetricsQuery): { metrics: ResourceMetricRow[]; total: number } => {
    const db = getDatabase()
    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    if (query.serverId) {
      conditions.push('serverId = @serverId')
      params.serverId = query.serverId
    }
    if (query.appId) {
      conditions.push('appId = @appId')
      params.appId = query.appId
    }
    if (query.containerId) {
      conditions.push('containerId = @containerId')
      params.containerId = query.containerId
    }
    if (query.startTime) {
      conditions.push('timestamp >= @startTime')
      params.startTime = query.startTime
    }
    if (query.endTime) {
      conditions.push('timestamp <= @endTime')
      params.endTime = query.endTime
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM resource_metrics ${whereClause}`).get(params) as { count: number }
    const total = countRow.count

    const limit = query.limit || 1000
    const offset = query.offset || 0
    const metrics = db.prepare(`
      SELECT * FROM resource_metrics ${whereClause}
      ORDER BY timestamp ASC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset }) as ResourceMetricRow[]

    return { metrics, total }
  },

  getSummary: (serverId?: string, appId?: string, period: string = '24h'): MetricsSummary => {
    const db = getDatabase()
    const now = new Date()
    let startTime: Date

    switch (period) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000)
        break
      case '6h':
        startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000)
        break
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }

    const conditions: string[] = ['timestamp >= @startTime']
    const params: Record<string, unknown> = { startTime: startTime.toISOString() }

    if (serverId) {
      conditions.push('serverId = @serverId')
      params.serverId = serverId
    }
    if (appId) {
      conditions.push('appId = @appId')
      params.appId = appId
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    const row = db.prepare(`
      SELECT 
        AVG(cpuPercent) as avgCpuPercent,
        MAX(cpuPercent) as maxCpuPercent,
        AVG(memoryUsage) as avgMemoryUsage,
        MAX(memoryUsage) as maxMemoryUsage,
        AVG(networkRx) as avgNetworkRx,
        AVG(networkTx) as avgNetworkTx,
        SUM(blockRead) as totalBlockRead,
        SUM(blockWrite) as totalBlockWrite,
        COUNT(*) as dataPoints
      FROM resource_metrics
      ${whereClause}
    `).get(params) as {
      avgCpuPercent: number | null
      maxCpuPercent: number | null
      avgMemoryUsage: number | null
      maxMemoryUsage: number | null
      avgNetworkRx: number | null
      avgNetworkTx: number | null
      totalBlockRead: number | null
      totalBlockWrite: number | null
      dataPoints: number
    }

    return {
      avgCpuPercent: row.avgCpuPercent || 0,
      maxCpuPercent: row.maxCpuPercent || 0,
      avgMemoryUsage: row.avgMemoryUsage || 0,
      maxMemoryUsage: row.maxMemoryUsage || 0,
      avgNetworkRx: row.avgNetworkRx || 0,
      avgNetworkTx: row.avgNetworkTx || 0,
      totalBlockRead: row.totalBlockRead || 0,
      totalBlockWrite: row.totalBlockWrite || 0,
      dataPoints: row.dataPoints,
      period
    }
  },

  deleteBefore: (date: string): number => {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM resource_metrics WHERE timestamp < ?').run(date)
    return result.changes
  },

  clear: (): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM resource_metrics').run()
  },

  getLatestByServer: (serverId: string): ResourceMetricRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM resource_metrics WHERE serverId = ? ORDER BY timestamp DESC LIMIT 1').get(serverId) as ResourceMetricRow | undefined
  },

  getLatestByContainer: (containerId: string): ResourceMetricRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM resource_metrics WHERE containerId = ? ORDER BY timestamp DESC LIMIT 1').get(containerId) as ResourceMetricRow | undefined
  }
}

export interface ServerGroupRow {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface ServerGroupMemberRow {
  groupId: string
  serverId: string
}

export const serverGroupQueries = {
  getAll: (): ServerGroupRow[] => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM server_groups ORDER BY createdAt DESC').all() as ServerGroupRow[]
  },

  getById: (id: string): ServerGroupRow | undefined => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM server_groups WHERE id = ?').get(id) as ServerGroupRow | undefined
  },

  insert: (group: Omit<ServerGroupRow, 'createdAt' | 'updatedAt'>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO server_groups (id, name, description, createdAt, updatedAt)
      VALUES (@id, @name, @description, @createdAt, @updatedAt)
    `).run({ ...group, createdAt: now, updatedAt: now })
  },

  update: (id: string, updates: Partial<ServerGroupRow>): void => {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'createdAt')
      .map(key => `${key} = @${key}`)
      .join(', ')

    if (fields) {
      db.prepare(`UPDATE server_groups SET ${fields}, updatedAt = @updatedAt WHERE id = @id`)
        .run({ ...updates, id, updatedAt: now })
    }
  },

  delete: (id: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM server_groups WHERE id = ?').run(id)
  },

  getServersByGroupId: (groupId: string): ServerRow[] => {
    const db = getDatabase()
    return db.prepare(`
      SELECT s.* FROM servers s
      INNER JOIN server_group_members sgm ON s.id = sgm.serverId
      WHERE sgm.groupId = ?
      ORDER BY s.createdAt DESC
    `).all(groupId) as ServerRow[]
  },

  addServerToGroup: (groupId: string, serverId: string): void => {
    const db = getDatabase()
    db.prepare(`
      INSERT OR IGNORE INTO server_group_members (groupId, serverId)
      VALUES (?, ?)
    `).run(groupId, serverId)
  },

  removeServerFromGroup: (groupId: string, serverId: string): void => {
    const db = getDatabase()
    db.prepare('DELETE FROM server_group_members WHERE groupId = ? AND serverId = ?').run(groupId, serverId)
  },

  getServerGroups: (serverId: string): ServerGroupRow[] => {
    const db = getDatabase()
    return db.prepare(`
      SELECT sg.* FROM server_groups sg
      INNER JOIN server_group_members sgm ON sg.id = sgm.groupId
      WHERE sgm.serverId = ?
      ORDER BY sg.createdAt DESC
    `).all(serverId) as ServerGroupRow[]
  }
}
