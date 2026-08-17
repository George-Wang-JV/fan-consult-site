# 粉丝咨询中心（MVP）

一个可直接运行的 Node.js 网站：

- 注册 / 登录
- 用户主页
- 粉丝与管理员一对一咨询
- 管理员创建粉丝群
- 用户申请入群，管理员审核
- 群聊实时消息
- 管理员禁言 / 解除禁言 / 踢人
- 管理员置顶群消息
- SQLite 本地数据库
- Socket.IO 实时通信
- Web Push 系统通知、未读红点与通知点击直达会话

## 1. 本地运行

要求：Node.js 20+

```bash
cp .env.example .env
# 修改 .env 中的 SESSION_SECRET、管理员账号和 VAPID 配置
npm install
npm start
```

浏览器打开：

```text
http://localhost:3000
```

第一次启动时，会根据 `.env` 自动创建管理员账号。

## 2. 上传到 GitHub

在 GitHub 新建一个空仓库后，在项目目录执行：

```bash
git init
git add .
git commit -m "Initial fan consultation site"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

注意：`.env`、数据库和 `node_modules` 已经在 `.gitignore` 中，不应上传。

## 3. 为什么不能只用 GitHub Pages

GitHub Pages 只能托管静态 HTML/CSS/JS，不能运行本项目的 Node.js 服务端、SQLite、登录 Session 和 Socket.IO。

推荐方式：

- GitHub：存代码
- 腾讯云 / 阿里云中国大陆服务器：运行 Node.js
- 域名：指向服务器
- Nginx：反向代理 80/443 到本项目 3000 端口

## 4. 腾讯云轻量服务器部署示例

以下以 Ubuntu 为例。

```bash
sudo apt update
sudo apt install -y git nginx

# 安装 Node.js 20+（也可直接购买带 Node.js 环境的镜像）
node -v
npm -v

cd /var/www
sudo git clone https://github.com/你的用户名/你的仓库名.git fan-consult-site
sudo chown -R $USER:$USER /var/www/fan-consult-site
cd /var/www/fan-consult-site

cp .env.example .env
nano .env
npm install --omit=dev

sudo npm install -g pm2
pm2 start server.js --name fan-consult-site
pm2 save
pm2 startup
```

`.env` 生产环境示例：

```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=这里放至少32位随机字符串
ADMIN_EMAIL=你的管理员邮箱
ADMIN_PASSWORD=一个非常强的管理员密码
ADMIN_NICKNAME=管理员
VAPID_PUBLIC_KEY=使用下方命令生成的公钥
VAPID_PRIVATE_KEY=使用下方命令生成的私钥
VAPID_SUBJECT=mailto:你的联系邮箱
```

首次配置 Web Push 时，在项目目录生成一对 VAPID 密钥（生成后应长期保持不变，不要提交私钥）：

```bash
npx web-push generate-vapid-keys
```

将输出的公钥和私钥填入 `.env`。Web Push 在生产环境需要 HTTPS；用户登录后点击“开启新消息通知”并允许浏览器权限即可订阅。

iPhone/iPad 需要先在 Safari 中选择“分享 → 添加到主屏幕”，再从主屏幕图标打开网站并允许通知。开启成功后，网站会立即发送一条测试通知；如果失败，页面会显示具体错误。

更新已部署的服务：

```bash
git pull
npm install
# 编辑 .env，加入 VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY、VAPID_SUBJECT
pm2 restart fan-consult-site
```

## 5. Nginx 配置

创建：

```bash
sudo nano /etc/nginx/sites-available/fan-consult-site
```

内容：

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用：

```bash
sudo ln -s /etc/nginx/sites-available/fan-consult-site /etc/nginx/sites-enabled/fan-consult-site
sudo nginx -t
sudo systemctl reload nginx
```

然后把你的域名 A 记录指向服务器公网 IP。

## 6. HTTPS

生产环境必须使用 HTTPS。可以在腾讯云申请/购买 SSL 证书并部署到 Nginx，或使用你自己的受信任证书。

## 7. 中国大陆上线注意

若服务器放在中国大陆并通过域名公开提供网站服务，需要按现行要求办理 ICP 备案。聊天、群聊、用户生成内容及经营性服务还可能涉及额外的增值电信业务许可、实名、内容治理、隐私和数据合规要求。正式对公众开放前应按你的实际业务模式向主管部门/专业合规人员确认。

## 8. 这是 MVP，不是最终生产版

正式上线建议继续补：

- 手机号登录 / 实名认证（如适用）
- 验证码与防刷
- CSRF 与更细粒度权限控制
- 图片上传与内容审核
- 举报 / 拉黑 / 敏感词与审计日志
- 消息撤回 / 已读状态
- 管理员操作日志
- MySQL / PostgreSQL（用户量增大后）
- Redis + 多实例 Socket.IO（横向扩容后）
- 数据备份、容灾和监控
