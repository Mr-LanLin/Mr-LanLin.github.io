// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // 你的站点地址。部署到 GitHub Pages 后改成真实域名,例如:
  //   - 用户主页:https://<你的用户名>.github.io
  //   - 项目主页:https://<你的用户名>.github.io/<仓库名>
  site: 'https://mr-lanlin.github.io',

  // 站点部署的根路径。
  //   - 用户主页(<用户名>.github.io):保持 '/' 即可
  //   - 项目主页(<用户名>.github.io/<仓库名>):需要改成 '/<仓库名>/'
  // 因为 GitHub 把静态资源放在子路径下,base 设错了会找不到 CSS/JS。
  base: '/',

  integrations: [
    sitemap(),
  ],
});
