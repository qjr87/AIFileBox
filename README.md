# 归档台

基于 Tauri 2、React、TypeScript、Rust 和 SQLite 的本地文件归档工作台。

## 已实现

- 登记本机文件夹为文件库，拒绝重复和父子路径重叠
- 编辑并发布文件库收录说明
- 递归显示文件库内的多层文件夹
- 导入多个文件、整体文件夹，或明确递归展开文件夹
- 使用本地规则推荐目标文件库，无需云端密钥即可工作
- 手动修改和确认推荐结果
- 复制或移动归档；同名目标自动跳过，绝不覆盖
- 整体文件夹保留目录结构，并阻止符号链接和自包含目标
- SQLite 操作历史、在资源管理器中显示、签名校验后的有限撤销
- 浏览器演示模式和 Tauri 桌面实时数据模式

## 开发

```powershell
npm install
npm run tauri -- dev
```

前端检查：

```powershell
npm run build
```

Rust 检查：

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

## 打包

```powershell
npm run tauri -- build
```

Windows 安装包会生成在 `src-tauri/target/release/bundle/nsis/`。SQLite 数据保存在操作系统为应用分配的数据目录中。

当前分类器使用本地文件名、路径和文件库说明做确定性推荐。设置中的云端分析和系统右键入口只记录用户偏好；需要选择服务商和安装注册方案后才能启用对应平台能力。
