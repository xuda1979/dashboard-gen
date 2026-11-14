# 17 — Dashboard-Gen: 智能体落地页 / 内部工具只读仪表板生成器

## 定位
Lovable / Replit（Lovable $400M+，Replit ~$525M ARR）线：以 YAML/JSON 描述，
自动生成纯静态（只读）落地页或内部工具仪表板——生成器本地跑，产出可部署文件。
母市场：智能建站新贵。

## 主要痛点
- 每做一个内部工具/实验要写一片 dashboard/落地页，重复
- LLM 建站（Lovable 等）在私有环境 高权限敏感
- 想要「声明式 UI」（写 YAML 出页面）可控、可审计、离线

## 功能需求
1. 声明式页面模型（YAML/JSON DSL）：
   - 布局：grid/sidebar/hero/section
   - 组件：headline/paragraph/button/link/card/table/chart（数据内嵌或绑定 fetch）
   - 主题（类 tailwind 的 token）
2. 生成器：
   - 输入 DSL → 输出静态 HTML/CSS/JS（或 React 构建产物）
   - 一键产可作为 GitHub Pages / 纯静态部署
3. 数据绑定（只读）：
   - `data: fetch(url)` 选项（CORS 需要注意；本地 demo 用 fixtures）
   - CSV/JSON 内嵌数据选项
4. 内置可访问性：ARIA、对比度检查（页面生成后 curl -lint）
5. 组件库（可扩展 10+ 组件）：
   - charts（local：多张图不用外部 lib — 用 light SVG chart）
6. 实时开发：watch 模式（DSL 改 → 重产出）
7. CLI：`dg new / dg build / dg serve`

## 非目标
- 交互式后端逻辑（本项目严格只读/静态）
- WYSIWYG 编辑器（v2 可选）

## 技术栈
- Node v22（核心生成器）或 Python 3.14
- 产出：纯 HTML/CSS/JS（零运行时依赖，SVG chart 本地实现）
- 模板引擎（nunjucks / jinja2）+ YAML 解析
- 测试：DSL fixtures → 生成 → 断言 DOM 结构

## 低算力守则
见全局（纯模板 + 本地生成 = 完全符合）。

## AC
1. 给定 5 种 DSL 示例（landing/table/chart/dashboard/fetch），生成正确的单文件 HTML
2. 生成页面无外部 CDN 依赖（离线可开）
3. chart 组件（line/bar/pie）基于数据正确渲染（不依赖图表库自实现 SVG）
4. `watch` 模式：改 DSL 自动重建
5. 生成的页面通过基础 accessibility 断言（有 aria/标签）
6. 可发布 GitHub Pages（提供 action 示例）
7. 测试 + README + examples

## Phases
- P0: DSL + 渲染核心（基础组件）
- P1: chart 组件 + 数据绑定
- P2: watch + 部署/action
- P3: 组件库扩 + a11y 检查

## 里程碑
M1: DSL→HTML 单页面（MVP）
M2: charts + data
M3: watch + Pages 部署

## 变现
- 开源生成器，云版 = 托管/协作
