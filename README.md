# LogicSim · 让推理，一目了然

一个中文命题逻辑可视化工具。写下表达式，查看运算结构、布尔决策图和完整真值表，切换命题取值并保存自己的思路。

项目源码：[cnm-nmd/logicsim-modern](https://github.com/cnm-nmd/logicsim-modern)。

新版网站：[LogicSim](https://cnm-nmd.github.io/logicsim-modern/)。原版保留入口：[原版网站](https://cnm-nmd.github.io/logicsim-modern/legacy/)。

由当前 Codex 对话完成改造。UI 参考用户指定的 Apple 中国在线商店的浅灰背景、大标题、留白、细导航和圆角卡片；新增界面与图形组件独立实现。

## 运行

这是一个无构建依赖的静态网站。新增页面使用浏览器原生 JavaScript 模块，不需要安装 npm 包。

安装 Node.js 20 或更新版本后，在项目目录运行：

```sh
node server.mjs
```

访问 http://127.0.0.1:4173/ 。原版入口为 http://127.0.0.1:4173/legacy/ 。

可用 `PORT` 环境变量指定端口。请通过 HTTP 服务打开新版；直接双击 HTML 会受到浏览器模块跨源限制。

## 功能

- 普通表达式：`(P ∧ Q) → R`，也支持 `(P & Q) -> R`、AND / OR / NOT / IMPLIES / IFF。
- 原版逆波兰表达式：`P Q . R >`，保留 `. , < > =` 五种运算符。
- 两种写法可相互转换，解析失败时显示具体的中文反馈。
- 结构图显示运算顺序；布尔决策图按命题真假选择分支并合并重复子图。
- 点击命题按钮切换真假，图中节点、连线与输出即时更新。
- 真值表遍历全部组合；支持最多 10 个不同命题，即 1024 行。页面每页显示 16 行，CSV 导出包含全部行。
- 识别恒真式、矛盾式和可满足式。点击真值表行可应用该行取值。
- 点击图形节点修改显示名称和备注；可平移、缩放并恢复适应画布。
- 保存 / 载入新版项目 JSON，保留表达式、命题取值和节点备注。
- 兼容原版 `nodeArray` / `linkArray` JSON，原版带反馈回路的 latch 示例可以显示。
- JSON 视图支持图转文本、文本转图；任意导入图仅显示结构，真值分析需要表达式。
- 导出 SVG、PNG、完整 CSV；分享链接包含表达式及命题取值。
- 最近表达式保存在当前浏览器；桌面与手机布局均可用。
- 原版站点完整保留在 `legacy/` 中。

## 逻辑规则

运算优先级由高到低为：非、与、或、推出、等价。推出按右结合处理：`P → Q → R` 表示 `P → (Q → R)`。等价按左结合处理。括号可以显式控制顺序。

`0` / `1`、`false` / `true`、`⊥` / `⊤` 是常量。命题名称区分大小写，可使用字母、中文、数字和下划线，且不要以数字开头。量词与一阶谓词逻辑不属于这一版的功能。

## 检查

```sh
node --test tests/logic.test.mjs
```

11 组测试覆盖五种运算、优先级、语法互转、错误输入、复杂度限制、决策图的全部赋值结果、与原版解析器的一致性、反馈图导入和 SVG 文本转义。

开发时还完成了 16 组 Edge 浏览器检查，包含原站本地运行、导入导出、分享恢复、节点备注、1024 行 CSV 和 390px 手机布局。测试证据保存在项目外的当前工作区 `checks/` 目录，不随站点发布。

## 免费托管

所有站点资源使用相对路径，支持 GitHub Pages 的项目子目录，也可部署到 GitLab Pages、Cloudflare Pages 或 Vercel 的静态服务。无需数据库、后端或付费域名。

### GitHub Pages

将本项目上传到一个公开 GitHub 仓库。在仓库 Settings → Pages 中选择 **Deploy from a branch**，分支 `main`，目录 `/(root)`，保存。根目录的 `.nojekyll` 让纯静态文件直接发布。

参考：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

### GitLab Pages

将本项目上传到 GitLab。随附的 `.gitlab-ci.yml` 会先运行逻辑测试，再把 `index.html`、CSS、JavaScript、图标、说明和原版入口复制到 Pages 的 `public` 目录。实际访问地址以项目 Deploy → Pages 显示的地址为准。

参考：https://docs.gitlab.com/user/project/pages/

### Cloudflare Pages

使用项目根目录作为静态文件目录，构建命令留空；也可以使用直接上传方式。免费计划有服务配额，详见官方说明。

参考：https://developers.cloudflare.com/pages/framework-guides/deploy-anything/

## 文件

```text
index.html       页面结构
style.css        响应式 UI
src/logic.js     两种语法、计算、真值表、布尔决策模型
src/diagram.js   SVG 图形与布局
src/app.js       页面交互、文件和链接
assets/         新版图标
legacy/         原版完整静态文件
tests/          逻辑与兼容性测试
server.mjs      本地预览服务器
.gitlab-ci.yml  GitLab Pages 发布配置
```

## 来源与第三方文件

原项目：https://gitlab.com/kuangdash/logicsim

原站：https://kuangdash.gitlab.io/logicsim/

下载日期：2026-10-06。原版快照提交：`4498910e8f8efff0d7dfd4840739298e2a29f06e`。

`legacy/` 中的 29 个文件保持下载原样，包括 jQuery、Lodash、Backbone、JointJS、Dagre、Graphlib、Select2、W3.CSS 和原版字体文件；其来源与版权声明以各文件自带信息及原项目为准。新版的主要界面不加载这些依赖。UI 参考页面的商品图片、Apple 商标、统计脚本和用户粘贴的原始 HTML 均不包含在本项目中。
