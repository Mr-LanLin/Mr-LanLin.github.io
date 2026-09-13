import { defineCollection, z } from 'astro:content';

// 定义「博客文章」这个内容集合的 frontmatter 结构
// 每篇文章的 Markdown 顶部都会有一块 YAML 元数据,这里声明它有哪些字段。
const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),          // 文章标题(必填)
    description: z.string(),    // 文章摘要(必填,用于列表页和 SEO)
    pubDate: z.coerce.date(),   // 发布日期(必填)
    category: z.union([z.string(), z.array(z.string())]).default('未分类'),   // 分类(支持单个或多个)
    updatedDate: z.coerce.date().optional(), // 更新日期(可选)
    heroImage: z.string().optional(),        // 封面图(可选)
    tags: z.array(z.string()).default([]),   // 标签(可选,默认空数组)
    draft: z.boolean().default(false),       // 是否为草稿(草稿不会出现在列表)
  }),
});

// 把集合注册给 Astro,后续通过 astro:content 读取
export const collections = { blog };
