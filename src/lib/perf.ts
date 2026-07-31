// 大文本降级阈值：小输入保持原有体验，超过阈值才切换到省资源的行为

// FormatTool 错误高亮层的行数上限：超过就不渲染该层（issue 点击定位不依赖它，仍可用）
export const LARGE_LINES = 5000

// DiffView / FoldView 分批渲染的每批行数
export const ROWS_PAGE = 2000

// 内容超过这个字符数时，autoresize 的 scrollHeight 测量改为防抖
// （对巨大内容每次按键都全量 reflow 测一次高度，本身就是卡顿源）
export const HUGE_TEXT_CHARS = 300_000

// Base64 结果的显示字符上限：超过只显示前段（复制仍是完整内容）
export const MAX_OUT_CHARS = 200_000
