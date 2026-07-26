# 黑蚁飞盘队网站项目进度

最后更新：2026-07-27
当前线上版本：`dut-ultimate-website-012`（部署成功）

## 线上环境

- 长期宣传域名：<https://dutultimate.club/>（等待 SSL 证书和 ICP 备案后绑定）
- 当前可访问地址：<https://dut-ultimate-website-black-ants-prod-d7flfzzv4b3a8f70.webapps.tcloudbase.com/>
- CloudBase 环境：`black-ants-prod-d7flfzzv4b3a8f70`
- 应用：`dut-ultimate-website`
- 云函数：`member-api`
- 数据集合：`members`、`team_photos`、`team_debuts`、`member_identity_claims`
- 管理员账号已创建；密码、UID、访问密钥等敏感信息不得写入仓库。

## 已完成功能

- 响应式七章节官网，保留横向切换并禁用手机纵向切页。
- Bilibili 历史、传盘方式和基础教程入口。
- 中国大陆可访问的官方规则链接及飞盘术语、英文口令、手势速查词典。
- 成员登记：真实姓名仅审核可见，昵称公开，入学/入社年份、头像和姓名唯一性校验。
- 成员、照片、首次比赛三类管理员审核流程。
- 公开图库和独立照片上传页。
- 首次正式比赛登记；审核后进入“黑蚁飞盘队”分区并显示入队年份。
- 公开接口不返回真实姓名、内部成员 ID 或首次比赛备注。
- 后台提示首次比赛提交身份是否与成员申请时一致，身份不一致时须人工核实。
- 官网、后台、照片上传和首次比赛共 8 张标准码/主题二维码。

## 必须保持的产品约束

- 队徽只用于左上角品牌头像，不在其他区域重复展示。
- 所有公开内容必须先经管理员审核。
- 旧 CloudBase 默认域名长期保留，保证已分享或印刷的旧二维码可用。
- 长期二维码地址统一由 `scripts/site-urls.mjs` 管理，不要在其他脚本重复硬编码。
- 公开页面只展示昵称和允许公开的资料，不泄露真实姓名、提交者 UID 或比赛备注。

## 当前待办

1. 在腾讯云 SSL 控制台申请 `dutultimate.club` 免费证书。
2. 完成 ICP 备案；自动申请证书曾因缺少 `ssl:ApplyCertificate` 权限失败。
3. 证书和备案完成后绑定 CloudBase 自定义域名，配置 DNS、认证域名与 HTTPS。
4. 用微信和手机相机实测所有二维码，再确认可用于印刷。

## 验证与部署

```powershell
npm test
npm run build
npm run cloudbase:deploy:function
npm run cloudbase:deploy:web
npm run verify:live
```

最近验收：11 项测试通过、生产构建通过、线上页面及 8 张二维码解码通过。部署网站前会自动重新生成二维码。

## 迭代记录要求

每次完成重要迭代后，更新本文件的日期、线上版本、已完成功能、待办和验收结果；同步更新 `README.md` 与 `docs/CLOUDBASE_DEPLOYMENT.md` 中受影响的部署说明。
