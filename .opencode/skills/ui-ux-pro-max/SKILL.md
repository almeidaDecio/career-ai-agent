---
name: ui-ux-pro-max
description: UI/UX 设计智能与可搜索数据库
---
# ui-ux-pro-max

Web 和移动应用程序的综合设计指南。包含 67 种风格、96 个调色板、57 组字体配对、99 条 UX 指南，以及跨 13 个技术栈的 25 种图表类型。基于优先级的可搜索数据库推荐。

## 前提条件 (Prerequisites)

检查是否安装了 Python：

```bash
python --version || python --version
```

如果未安装 Python，根据用户的操作系统安装：

**macOS:**
```bash
brew install python3
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install python3
```

**Windows:**
```powershell
winget install Python.Python.3.12
```

---

## 如何使用此技能 (How to Use This Skill)

当用户请求 UI/UX 工作（设计、构建、创建、实现、审查、修复、改进）时，遵循此工作流：

### Step 1: 分析用户需求 (Analyze User Requirements)

从用户请求中提取关键信息：
- **产品类型 (Product type)**：SaaS、电商、作品集、仪表板、落地页等
- **风格关键词 (Style keywords)**：极简、活泼、专业、优雅、深色模式等
- **行业 (Industry)**：医疗、金融科技、游戏、教育等
- **技术栈 (Stack)**：React、Vue、Next.js，或默认 `html-tailwind`

### Step 2: 生成设计系统（必需）(Generate Design System - REQUIRED)

**始终以 `--design-system` 开始**获取带推理的全面推荐：

```bash
python .opencode/skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

此命令：
1. 并行搜索 5 个域（product、style、color、landing、typography）
2. 应用 `ui-reasoning.csv` 中的推理规则选择最佳匹配
3. 返回完整设计系统：模式、风格、颜色、排版、效果
4. 包含要避免的反模式

**示例：**
```bash
python .opencode/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service" --design-system -p "Serenity Spa"
```

### Step 2b: 持久化设计系统（Master + Overrides 模式）(Persist Design System)

要保存设计系统以便跨会话分层检索，添加 `--persist`：

```bash
python .opencode/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
```

这将创建：
- `design-system/MASTER.md` — 包含所有设计规则的全局事实来源
- `design-system/pages/` — 页面特定覆盖的文件夹

**带页面特定覆盖：**
```bash
python .opencode/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name" --page "dashboard"
```

这还将创建：
- `design-system/pages/dashboard.md` — 与 Master 的页面特定偏差

**分层检索如何工作：**
1. 构建特定页面（如"Checkout"）时，首先检查 `design-system/pages/checkout.md`
2. 如果页面文件存在，其规则**覆盖** Master 文件
3. 如果不存在，则仅使用 `design-system/MASTER.md`

### Step 3: 用详细搜索补充（按需）(Supplement with Detailed Searches)

获取设计系统后，使用域搜索获取额外详情：

```bash
python .opencode/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

**何时使用详细搜索：**

| 需求 | Domain | 示例 |
|------|--------|------|
| 更多风格选项 | `style` | `--domain style "glassmorphism dark"` |
| 图表推荐 | `chart` | `--domain chart "real-time dashboard"` |
| UX 最佳实践 | `ux` | `--domain ux "animation accessibility"` |
| 替代字体 | `typography` | `--domain typography "elegant luxury"` |
| 落地页结构 | `landing` | `--domain landing "hero social-proof"` |

### Step 4: 技术栈指南（默认：html-tailwind）(Stack Guidelines)

获取特定于实现的最佳实践。如果用户未指定技术栈，**默认为 `html-tailwind`**。

```bash
python .opencode/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack html-tailwind
```

可用技术栈：`html-tailwind`、`react`、`nextjs`、`vue`、`svelte`、`swiftui`、`react-native`、`flutter`、`shadcn`、`jetpack-compose`

---

## 搜索参考 (Search Reference)

### 可用域 (Available Domains)

| Domain | 用途 | 示例关键词 |
|--------|------|------------|
| `product` | 产品类型推荐 | SaaS、电商、作品集、医疗、美容、服务 |
| `style` | UI 风格、颜色、效果 | 玻璃态、极简主义、深色模式、野性主义 |
| `typography` | 字体配对、Google Fonts | 优雅、活泼、专业、现代 |
| `color` | 按产品类型的调色板 | saas、电商、医疗、美容、金融科技、服务 |
| `landing` | 页面结构、CTA 策略 | hero、hero-centric、testimonial、pricing、social-proof |
| `chart` | 图表类型、库推荐 | 趋势、比较、时间线、漏斗、饼图 |
| `ux` | 最佳实践、反模式 | 动画、无障碍、z-index、加载 |
| `react` | React/Next.js 性能 | waterfall、bundle、suspense、memo、rerender、cache |
| `web` | Web 界面指南 | aria、focus、keyboard、semantic、virtualize |
| `prompt` | AI 提示、CSS 关键词 | （风格名称）|

### 可用技术栈 (Available Stacks)

| Stack | 重点 |
|-------|------|
| `html-tailwind` | Tailwind 工具类、响应式、a11y（默认）|
| `react` | State、hooks、性能、模式 |
| `nextjs` | SSR、路由、图片、API 路由 |
| `vue` | Composition API、Pinia、Vue Router |
| `svelte` | Runes、stores、SvelteKit |
| `swiftui` | Views、State、Navigation、Animation |
| `react-native` | 组件、Navigation、Lists |
| `flutter` | Widgets、State、Layout、Theming |
| `shadcn` | shadcn/ui 组件、主题、表单、模式 |
| `jetpack-compose` | Composables、Modifiers、State Hoisting、Recomposition |

---

## 示例工作流 (Example Workflow)

**用户请求：** "为专业护肤服务创建落地页"

### Step 1: 分析需求 (Analyze Requirements)
- Product type: 美容/水疗服务
- Style keywords: 优雅、专业、柔和
- Industry: 美容/健康
- Stack: html-tailwind（默认）

### Step 2: 生成设计系统（必需）(Generate Design System - REQUIRED)

```bash
python .opencode/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service elegant" --design-system -p "Serenity Spa"
```

**输出：** 完整设计系统，包含模式、风格、颜色、排版、效果和反模式。

### Step 3: 用详细搜索补充（按需）(Supplement with Detailed Searches)

```bash
# Get UX guidelines for animation and accessibility
python .opencode/skills/ui-ux-pro-max/scripts/search.py "animation accessibility" --domain ux

# Get alternative typography options if needed
python .opencode/skills/ui-ux-pro-max/scripts/search.py "elegant luxury serif" --domain typography
```

### Step 4: 技术栈指南 (Stack Guidelines)

```bash
python .opencode/skills/ui-ux-pro-max/scripts/search.py "layout responsive form" --stack html-tailwind
```

**然后：** 综合设计系统 + 详细搜索并实现设计。

---

## 输出格式 (Output Formats)

`--design-system` 标志支持两种输出格式：

```bash
# ASCII box (default) - 最适合终端显示
python .opencode/skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system

# Markdown - 最适合文档
python .opencode/skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system -f markdown
```

---

## 获得更好结果的技巧 (Tips for Better Results)

1. **关键词要具体** - "healthcare SaaS dashboard" > "app"
2. **多次搜索** - 不同关键词揭示不同见解
3. **组合域** - Style + Typography + Color = 完整设计系统
4. **始终检查 UX** - 搜索"animation"、"z-index"、"accessibility"处理常见问题
5. **使用 stack 标志** - 获取特定于实现的最佳实践
6. **迭代** - 如果第一次搜索不匹配，尝试不同关键词

---

## 专业 UI 的常见规则 (Common Rules for Professional UI)

这些是经常被忽视的让 UI 看起来不专业的问题：

### 图标与视觉元素 (Icons & Visual Elements)

| 规则 | 应该 | 不应该 |
|------|------|--------|
| **无 emoji 图标** | 使用 SVG 图标（Heroicons、Lucide、Simple Icons）| 使用 emoji 如 🎨 🚀 ⚙️ 作为 UI 图标 |
| **稳定的悬停状态** | 悬停时使用颜色/透明度过渡 | 使用会导致布局偏移的缩放变换 |
| **正确的品牌 Logo** | 从 Simple Icons 研究官方 SVG | 猜测或使用错误的 logo 路径 |
| **一致的图标大小** | 使用固定 viewBox (24x24) 配合 w-6 h-6 | 随机混合不同图标大小 |

### 交互与光标 (Interaction & Cursor)

| 规则 | 应该 | 不应该 |
|------|------|--------|
| **Cursor pointer** | 为所有可点击/可悬停卡片添加 `cursor-pointer` | 在交互元素上保留默认光标 |
| **悬停反馈** | 提供视觉反馈（颜色、阴影、边框）| 没有指示元素是交互式的 |
| **平滑过渡** | 使用 `transition-colors duration-200` | 瞬间状态变化或太慢（>500ms）|

### 亮/暗模式对比 (Light/Dark Mode Contrast)

| 规则 | 应该 | 不应该 |
|------|------|--------|
| **亮模式玻璃卡片** | 使用 `bg-white/80` 或更高不透明度 | 使用 `bg-white/10`（太透明）|
| **亮模式文本对比** | 使用 `#0F172A` (slate-900) 作为文本 | 使用 `#94A3B8` (slate-400) 作为正文 |
| **亮模式弱化文本** | 使用 `#475569` (slate-600) 最小 | 使用 gray-400 或更浅 |
| **边框可见性** | 在亮模式使用 `border-gray-200` | 使用 `border-white/10`（不可见）|

### 布局与间距 (Layout & Spacing)

| 规则 | 应该 | 不应该 |
|------|------|--------|
| **浮动导航栏** | 添加 `top-4 left-4 right-4` 间距 | 将导航栏贴到 `top-0 left-0 right-0` |
| **内容内边距** | 考虑固定导航栏高度 | 让内容隐藏在固定元素后面 |
| **一致的最大宽度** | 使用相同的 `max-w-6xl` 或 `max-w-7xl` | 混合不同的容器宽度 |

---

## 交付前检查清单 (Pre-Delivery Checklist)

在交付 UI 代码之前，验证这些项目：

### 视觉质量 (Visual Quality)
- [ ] 没有使用 emoji 作为图标（改用 SVG）
- [ ] 所有图标来自一致的图标集（Heroicons/Lucide）
- [ ] 品牌 Logo 正确（从 Simple Icons 验证）
- [ ] 悬停状态不会导致布局偏移
- [ ] 直接使用主题颜色（bg-primary）而非 var() 包装器

### 交互 (Interaction)
- [ ] 所有可点击元素有 `cursor-pointer`
- [ ] 悬停状态提供清晰的视觉反馈
- [ ] 过渡平滑（150-300ms）
- [ ] 键盘导航的焦点状态可见

### 亮/暗模式 (Light/Dark Mode)
- [ ] 亮模式文本有足够对比度（4.5:1 最小）
- [ ] 玻璃/透明元素在亮模式可见
- [ ] 边框在两种模式都可见
- [ ] 交付前测试两种模式

### 布局 (Layout)
- [ ] 浮动元素与边缘有适当间距
- [ ] 没有内容隐藏在固定导航栏后面
- [ ] 在 375px、768px、1024px、1440px 响应式
- [ ] 移动端无水平滚动

### 无障碍 (Accessibility)
- [ ] 所有图片有 alt 文本
- [ ] 表单输入有标签
- [ ] 颜色不是唯一的指示器
- [ ] 尊重 `prefers-reduced-motion`
