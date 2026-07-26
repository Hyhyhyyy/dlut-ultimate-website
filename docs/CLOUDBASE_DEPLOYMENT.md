# CloudBase 上线与长期运维

本项目使用 CloudBase 上海地域。前端只持有可公开的环境 ID 和 Publishable Key；腾讯云 SecretId、SecretKey 不得写入项目或浏览器代码。

## 1. 创建云环境

1. 登录腾讯云开发 CloudBase 控制台，新建上海地域环境。
2. 开通文档型数据库、云存储、云函数和静态网站托管。
3. 如需用该环境办理 ICP 备案，选择个人版或更高套餐、保证剩余有效期不少于 6 个月，并按控制台提示开通固定 IP。

## 2. 配置身份认证

1. 在“身份认证 → 登录方式”启用：
   - 匿名登录：供普通访客提交资料。
   - 用户名密码登录：仅供管理员登录审核页。
2. 在“身份认证 → 用户管理”新建一个注册用户，设置强密码。
3. 复制该用户的 UID，作为 `.env` 中的 `ADMIN_UID`。
4. 不开放前端用户注册入口，也不要给普通用户 CloudBase 管理员角色。

## 3. 创建数据库和访问规则

1. 在“文档型数据库 → 集合管理”创建 `members`、`team_photos`、`team_debuts` 和 `member_identity_claims` 集合。
2. 将四个集合都切换到自定义安全规则，并使用 [cloudbase-rules/database.json](../cloudbase-rules/database.json)：

```json
{
  "read": false,
  "write": false
}
```

3. 云存储使用 [cloudbase-rules/storage.json](../cloudbase-rules/storage.json) 禁止客户端直接读写。
4. 云函数使用 [cloudbase-rules/functions.json](../cloudbase-rules/functions.json)。平台层仅放通 `member-api` 入口；函数会先校验有效登录身份，管理员操作还会通过 `ADMIN_UID` 二次校验。

## 4. 配置本地环境

在项目根目录执行：

```powershell
Copy-Item .env.example .env
```

然后填写：

```dotenv
VITE_CLOUDBASE_ENV_ID=实际环境ID
VITE_CLOUDBASE_ACCESS_KEY=实际PublishableKey
ADMIN_UID=唯一管理员UID
```

Publishable Key 在“环境配置 → API Key 配置”中创建。它可用于浏览器；SecretId 和 SecretKey 不可使用在这里。

## 5. 部署

```bash
npm ci
npm run check
npm run cloudbase:login
npm run cloudbase:deploy:function
npm run cloudbase:deploy:web
```

部署后先使用 CloudBase 提供的测试地址完成以下验收：

1. 手机和电脑都能打开网站。
2. 提交成员资料后，公开名册不会立即出现该成员。
3. 打开 `/admin.html`，只有指定管理员可以登录。
4. 管理员通过后，刷新任意设备均可看到该成员。
5. 拒绝或删除后，数据库记录和头像文件均被清理。
6. 从 `/photos.html` 提交照片后，照片进入后台“日常照片”审核队列。
7. 照片通过后显示在主站图库，删除后数据库记录和照片文件均被清理。
8. 已公开成员从 `/debut.html` 提交首次正式比赛记录，后台“首次比赛”队列能够审核。
9. 审核通过后，该成员进入公开名册“黑蚁飞盘队”分区，并显示首次比赛与“XX年入队”。
10. 重复真实姓名、重复昵称，以及姓名与昵称相同的成员登记均会被拒绝。

## 6. 绑定长期域名

当前腾讯云账号没有域名时，依次完成：

1. 购买域名并完成实名认证，实名主体应与备案主体一致。
2. 使用满足条件的 CloudBase 环境或其他腾讯云境内资源提交 ICP 备案。
3. 备案通过后申请腾讯云免费 DV SSL 证书。
4. 在 CloudBase“HTTP 网关/静态托管 → 添加域名”中绑定域名并选择云开发 CDN。
5. 在 DNS 控制台添加 CloudBase 提供的 CNAME。
6. HTTPS 可访问后，将该域名作为唯一公开链接。
7. 网站正式上线后按当地要求及时完成公安联网备案，并在页脚展示备案号。

备案审核通常需要多个工作日，代码部署和默认测试地址验收可先完成。

## 7. 隐私和运维

- 表单要求填写真实姓名用于审核，并另填公开展示名称；公开接口不会返回真实姓名。
- 公开名册只展示昵称、年份、头像及入队年份；真实姓名和首次比赛备注仅管理员可见。
- 首次比赛记录若不是由成员登记时的匿名身份提交，后台会醒目标记，管理员须向队员本人核实后再确认。
- 真实姓名与展示昵称分别通过 `member_identity_claims` 保持唯一；确有同名时需联系管理员处理。
- 每位成员只登记一次；被拒绝或删除后会释放对应姓名与昵称，允许修正后重新提交。
- 日常照片经 `/photos.html` 提交，公开图库只展示审核通过的照片。
- 首次正式比赛经 `/debut.html` 登记并由管理员确认，确认年份作为黑蚁飞盘队入队年份。
- 管理员仅批准真实队员；收到删除请求后从审核后台删除。
- 每月检查云函数错误日志、数据库和存储用量，设置费用与资源告警。
- 定期导出 `members`、`team_debuts` 和 `member_identity_claims` 集合作为备份；不要把数据库导出文件提交到代码仓库。
- 更换管理员时，先创建新账号并更新 `ADMIN_UID`，重新部署云函数，再停用旧账号。
