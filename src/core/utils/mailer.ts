import { appConfig } from "@/config";
import { MailAttachment, MailDataType, MailerOptions } from "@/definitions";
import { Logger } from "@nestjs/common";
import fs from "fs";
import * as mime from "mime-types";
import { Client } from "node-mailjet";
import path from "path";
import { axiosClient } from "./axiosClient";

const mailjet = new Client({
  apiKey: appConfig.MAILJET_APIKEY_PUBLIC,
  apiSecret: appConfig.MAILJET_APIKEY_PRIVATE,
});

export async function sendMailJet(
  {
    to,
    from = { name: appConfig.MAILJET_FROM_NAME, email: appConfig.MAILJET_FROM },
  }: MailerOptions,
  mailData: MailDataType,
  removeAttachment = true
) {
  const attachments: MailAttachment[] = [];
  if (Array.isArray(mailData.attachments)) {
    for (const filePath of mailData.attachments) {
      try {
        const content = await fs.promises.readFile(filePath);
        const filename = path.basename(filePath);
        const contentType = mime.lookup(filePath);

        attachments.push({
          ContentType: contentType,
          Filename: filename,
          Base64Content: Buffer.from(content).toString("base64"),
        });
      } catch (error) {
        console.error("Error reading file:", filePath, error);
      }
    }
  }

  const request = mailjet.post("send", { version: "v3.1" }).request({
    Messages: [
      {
        From: { Email: from.email, Name: from.name },
        To: [{ Email: to.email, Name: to.name }],
        Subject: mailData.subject,
        HTMLPart: mailData.html,
        Attachments: attachments.length > 0 ? attachments : null,
      },
    ],
  });

  request
    .then(() => {
      if (
        removeAttachment &&
        mailData.attachments &&
        mailData.attachments.length > 0
      ) {
        for (const attachment of mailData.attachments) {
          fs.unlink(attachment, (err) => {
            if (err) Logger.error(err, "MAILJET ERROR");
          });
        }
      }
      Logger.log(mailData.subject, "MAILJET SENT");
    })
    .catch((err) => {
      Logger.error(err, "MAILJET ERROR");
    });
}

export async function sendMailJetWithTemplate(
  {
    to,
    from = { name: appConfig.MAILJET_FROM_NAME, email: appConfig.MAILJET_FROM },
  }: MailerOptions,
  mailData: MailDataType,
  removeAttachment = true
) {
  const attachments: MailAttachment[] = [];
  if (Array.isArray(mailData.attachments)) {
    for (const filePath of mailData.attachments) {
      try {
        const content = await fs.promises.readFile(filePath);
        const filename = path.basename(filePath);
        const contentType = mime.lookup(filePath);
        attachments.push({
          ContentType: contentType,
          Filename: filename,
          Base64Content: Buffer.from(content).toString("base64"),
        });
      } catch (error) {
        console.error("Error reading file:", filePath, error);
      }
    }
  }
  const request = mailjet.post("send", { version: "v3.1" }).request({
    Messages: [
      {
        From: { Email: from.email, Name: from.name },
        To: [{ Email: to.email, Name: to.name }],
        Subject: mailData.subject,
        TemplateID: mailData.templateId,
        TemplateLanguage: true,
        Variables: { ...mailData.variables },
        Attachments: attachments.length > 0 ? attachments : null,
      },
    ],
  });
  request
    .then(() => {
      if (
        removeAttachment &&
        mailData.attachments &&
        mailData.attachments.length > 0
      ) {
        for (const attachment of mailData.attachments) {
          fs.unlink(attachment, (err) => {
            if (err) Logger.error(err, "MAILJET ERROR");
          });
        }
      }
      Logger.log(mailData.subject, "MAILJET SENT");
    })
    .catch((err) => {
      Logger.error(err, "MAILJET ERROR");
    });
}

export async function sendZohoMailWithTemplate(
  {
    to,
    from = { name: appConfig.ZOHO_FROM_NAME, email: appConfig.ZOHO_FROM },
  }: MailerOptions,
  mailData: MailDataType
) {
  const response = await axiosClient(
    `https://api.zeptomail.com/v1.1/email/template`,
    {
      method: "POST",
      body: {
        template_key: mailData.templateId,
        from: { address: from.email, name: from.name },
        to: [
          {
            email_address: {
              address: to.email,
              name: to.name,
            },
          },
        ],
        merge_info: mailData.variables,
      },
      headers: {
        authorization: `Zoho-enczapikey ${appConfig.ZOHO_MAIL_CLIENT_ID}`,
      },
    }
  );
}
