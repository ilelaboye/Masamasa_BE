// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as compression from "compression";
import * as cookieParser from "cookie-parser";
import * as basicAuth from "express-basic-auth";
import helmet from "helmet";
import { join } from "path";
import { AppModule } from "./app.module";
import { appConfig } from "./config";
import { _AUTH_COOKIE_NAME_ } from "./constants";
import { GlobalExceptionFilter, HttpExceptionFilter } from "./modules";
import { GlobalHTTPInterceptor } from "./modules/global/interceptors/global-http.interceptor";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(cookieParser(appConfig.COOKIE_SECRET, {}));
  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: appConfig.ALLOWED_ORIGINS?.split(", "),
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  app.useStaticAssets(join(__dirname, "..", "public"));
  app.setBaseViewsDir(join(__dirname, "..", "views"));

  app.setViewEngine("hbs");

  app.use(
    ["/documentation", "/docs", "/logs", "/logs/error.log"],
    basicAuth({
      challenge: true,
      users: { ["masamasa"]: appConfig.SWAGGER_PASSWORD },
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle(`${appConfig.APP_NAME} Api`)
    .setDescription(`The ${appConfig.APP_NAME} API DOCUMENTATION`)
    .setVersion("1.0")
    .addServer(appConfig.APP_URL, "Server")
    .addTag(appConfig.APP_NAME)
    .addCookieAuth(_AUTH_COOKIE_NAME_)
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    ignoreGlobalPrefix: false,
  });

  SwaggerModule.setup("documentation", app, document, {
    customSiteTitle: `${appConfig.APP_NAME} App documentation`,
  });

  const httpAdapterHost = app.get(HttpAdapterHost);

  app.useGlobalInterceptors(new GlobalHTTPInterceptor());
  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new GlobalExceptionFilter(httpAdapterHost)
  );

  const port = process.env.PORT || appConfig.PORT || 4000;
  await app.listen(port, "0.0.0.0");

  console.info(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
