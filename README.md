# LogicSim

命题逻辑可视化工具，支持表达式计算、逻辑图和真值表。

[在线使用](https://cnm-nmd.github.io/logicsim-modern/) · [源码](https://github.com/cnm-nmd/logicsim-modern) · [原版入口](https://cnm-nmd.github.io/logicsim-modern/legacy/)

## 功能

- 普通表达式与逆波兰表达式互转，例如 `(P ∧ Q) → R` 和 `P Q . R >`。
- 逻辑结构图、布尔决策图、完整真值表，支持最多 10 个命题。
- 切换命题真假，识别恒真式、矛盾式和可满足式。
- 项目 JSON 导入导出、原版 JSON 兼容、节点备注。
- SVG、PNG、CSV 导出，表达式分享和浏览器历史记录。

## 本地运行

需要 Node.js 20 或更新版本，无需安装额外依赖。

```sh
node server.mjs
```

访问 http://127.0.0.1:4173/ 。

## 测试

```sh
node --test tests/logic.test.mjs
```

## 部署

GitHub Pages 使用 `main` 分支根目录发布，推送后自动更新。保留根目录的 `.nojekyll` 文件。
