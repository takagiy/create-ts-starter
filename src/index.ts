import { Eta } from "eta";
import path from "node:path";
import { Glob } from "glob";
import { mkdir, writeFile } from "node:fs/promises";
import { prompt } from "enquirer";
import gitUrlParse, { type GitUrl } from "git-url-parse";
import { execSync } from "node:child_process";

class TemplateWriter {
  private readonly templateDir = path.join(__dirname, "..", "template");
  private readonly eta = new Eta({
    views: this.templateDir,
    autoEscape: false,
  });

  constructor(
    private readonly projectName: string,
    private readonly outputDir: string,
    private readonly author: string,
    private readonly license: string,
    private readonly gitUrl?: GitUrl,
  ) {}

  static async fromPrompts(): Promise<TemplateWriter> {
    const { projectName } = await prompt<{ projectName: string }>({
      type: "text",
      name: "projectName",
      message: "Project name",
    });
    const { outputDir } = await prompt<{ outputDir: string }>({
      type: "text",
      name: "outputDir",
      message: "Output directory",
      initial: projectName || ".",
    });
    const { author } = await prompt<{ author: string }>({
      type: "text",
      name: "author",
      message: "Author",
      initial: () => {
        const name = execSync("git config user.name").toString();
        const email = execSync("git config user.email").toString();
        return `${name.trim()} <${email.trim()}>`;
      },
    });
    const { license } = await prompt<{ license: string }>({
      type: "text",
      name: "license",
      message: "License",
      initial: "MIT",
    });
    const { gitUrl } = await prompt<{ gitUrl: string }>({
      type: "text",
      name: "gitUrl",
      message: "Git URL (e.g. git@github.com:username/repository.git)",
    });
    return new TemplateWriter(
      projectName,
      path.resolve(outputDir),
      author,
      license,
      gitUrl ? gitUrlParse(gitUrl) : undefined,
    );
  }

  async write() {
    const templates = new Glob(path.join(this.templateDir, "**", "*"), {
      nodir: true,
      hidden: true,
    });
    for await (const template of templates) {
      const templateName = path.relative(this.templateDir, template);
      const outputPath = path.join(this.outputDir, templateName);
      const rendered = await this.eta.renderAsync(templateName, {
        projectName: this.projectName,
        author: this.author,
        license: this.license,
        repositoryUrl: this.repositoryUrl(),
        issueUrl: this.issueUrl(),
        homepageUrl: this.homepageUrl(),
      });
      this.writeFile(outputPath, rendered);
    }
  }

  async writeFile(outputPath: string, content: string) {
    const dir = path.dirname(outputPath);
    await mkdir(dir, { recursive: true });
    await writeFile(outputPath, content);
  }

  repositoryUrl() {
    if (!this.gitUrl) {
      return undefined;
    }
    if (this.gitUrl.protocol === "https") {
      return this.gitUrl.toString("https");
    }
    const { user, resource, full_name } = this.gitUrl;
    return `git+ssh://${user}@${resource}/${full_name}.git`;
  }

  issueUrl() {
    if (!this.gitUrl) {
      return undefined;
    }
    const { resource, full_name } = this.gitUrl;
    return `https://${resource}/${full_name}/issues`;
  }

  homepageUrl() {
    if (!this.gitUrl) {
      return undefined;
    }
    const { resource, full_name } = this.gitUrl;
    return `https://${resource}/${full_name}/#readme`;
  }
}

(async () => {
  const writer = await TemplateWriter.fromPrompts();
  await writer.write();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
