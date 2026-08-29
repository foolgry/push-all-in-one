import debug from 'debug'
import { Send } from '@/interfaces/send'
import { ajax } from '@/utils/ajax'
import { SendResponse } from '@/interfaces/response'
import { ConfigSchema, OptionSchema } from '@/interfaces/schema'
import { validate } from '@/utils/validate'

const Debugger = debug('push:webhook')

export type WebhookMethod = 'GET' | 'POST'

export interface WebhookConfig {
    /**
     * Webhook 地址。例如 https://example.com/hook
     */
    WEBHOOK_URL: string

    /**
     * 请求方法。默认为 POST
     */
    WEBHOOK_METHOD?: WebhookMethod

    /**
     * 请求头。JSON 字符串，例如 {"Authorization": "Bearer xxx"}
     */
    WEBHOOK_HEADERS?: string

    /**
     * 请求体模板。支持占位符 {{title}} {{body}} {{url}} {{task}}，默认为 "{{title}}\n{{body}}"。GET 请求忽略此项
     */
    WEBHOOK_BODY_TEMPLATE?: string
}

export type WebhookConfigSchema = ConfigSchema<WebhookConfig>
export const webhookConfigSchema: WebhookConfigSchema = {
    WEBHOOK_URL: {
        type: 'string',
        title: 'Webhook 地址',
        description: '例如 https://example.com/hook',
        required: true,
        default: '',
    },
    WEBHOOK_METHOD: {
        type: 'select',
        title: '请求方法',
        description: '默认为 POST',
        required: false,
        default: 'POST',
        options: [
            {
                label: 'POST',
                value: 'POST',
            },
            {
                label: 'GET',
                value: 'GET',
            },
        ],
    },
    WEBHOOK_HEADERS: {
        type: 'string',
        title: '请求头',
        description: 'JSON 字符串，例如 {"Authorization": "Bearer xxx"}',
        required: false,
        default: '',
    },
    WEBHOOK_BODY_TEMPLATE: {
        type: 'string',
        title: '请求体模板',
        description: '支持占位符 {{title}} {{body}} {{url}} {{task}}，默认为 "{{title}}\\n{{body}}"。GET 请求忽略此项',
        required: false,
        default: '{{title}}\n{{body}}',
    },
} as const

export interface WebhookOption {
    /**
     * 占位符 {{url}}，例如点击跳转的链接
     */
    url?: string

    /**
     * 占位符 {{task}}，例如任务名称等上下文信息
     */
    task?: string
}

export type WebhookOptionSchema = OptionSchema<WebhookOption>
export const webhookOptionSchema: WebhookOptionSchema = {
    url: {
        type: 'string',
        title: '占位符 {{url}}',
        description: '例如点击跳转的链接',
        required: false,
        default: '',
    },
    task: {
        type: 'string',
        title: '占位符 {{task}}',
        description: '例如任务名称等上下文信息',
        required: false,
        default: '',
    },
} as const

/**
 * 通用 Webhook 推送。通过 URL + Method + Headers + Body 模板接任何服务。
 *
 * @author foolgry
 * @date 2026-08-29
 * @export
 * @class Webhook
 */
export class Webhook implements Send {

    static readonly namespace = 'Webhook'
    static readonly configSchema = webhookConfigSchema
    static readonly optionSchema = webhookOptionSchema

    /**
     * Webhook 地址
     *
     * @author foolgry
     * @date 2026-08-29
     * @private
     */
    private WEBHOOK_URL: string

    /**
     * 请求方法
     *
     * @author foolgry
     * @date 2026-08-29
     * @private
     */
    private WEBHOOK_METHOD: WebhookMethod

    /**
     * 请求头（JSON 字符串解析结果）
     *
     * @author foolgry
     * @date 2026-08-29
     * @private
     */
    private WEBHOOK_HEADERS: Record<string, string>

    /**
     * 请求体模板
     *
     * @author foolgry
     * @date 2026-08-29
     * @private
     */
    private WEBHOOK_BODY_TEMPLATE: string

    /**
     * 创建 Webhook 实例
     * @author foolgry
     * @date 2026-08-29
     * @param config 配置
     */
    constructor(config: WebhookConfig) {
        const { WEBHOOK_URL, WEBHOOK_METHOD, WEBHOOK_HEADERS, WEBHOOK_BODY_TEMPLATE } = config
        this.WEBHOOK_URL = WEBHOOK_URL
        this.WEBHOOK_METHOD = WEBHOOK_METHOD || 'POST'
        this.WEBHOOK_HEADERS = this.parseHeaders(WEBHOOK_HEADERS)
        this.WEBHOOK_BODY_TEMPLATE = WEBHOOK_BODY_TEMPLATE ?? '{{title}}\n{{body}}'
        Debugger('set WEBHOOK_URL: "%s", WEBHOOK_METHOD: "%s", WEBHOOK_HEADERS: "%o", WEBHOOK_BODY_TEMPLATE: "%s"',
            WEBHOOK_URL, WEBHOOK_METHOD, this.WEBHOOK_HEADERS, this.WEBHOOK_BODY_TEMPLATE)
        // 根据 configSchema 验证 config
        validate(config, Webhook.configSchema)
    }

    /**
     * 解析 JSON 字符串形式的请求头
     *
     * @author foolgry
     * @date 2026-08-29
     * @param headers 请求头 JSON 字符串
     */
    private parseHeaders(headers?: string): Record<string, string> {
        if (!headers) {
            return {}
        }
        try {
            const parsed = JSON.parse(headers)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]))
            }
            Debugger('WEBHOOK_HEADERS 不是对象，忽略: "%s"', headers)
            return {}
        } catch (error) {
            Debugger('WEBHOOK_HEADERS 解析失败，忽略: "%s"', headers)
            return {}
        }
    }

    /**
     * 渲染模板占位符：{{title}} {{body}} {{url}} {{task}}
     *
     * @author foolgry
     * @date 2026-08-29
     * @param template 模板字符串
     * @param title 消息标题
     * @param desp 消息内容
     * @param option 额外选项
     */
    private renderTemplate(template: string, title: string, desp: string, option?: WebhookOption): string {
        const replace = (str: string): string => str
            .replaceAll('{{title}}', title)
            .replaceAll('{{body}}', desp)
            .replaceAll('{{url}}', option?.url ?? '')
            .replaceAll('{{task}}', option?.task ?? '')
        return replace(template)
    }

    /**
     * @author foolgry
     * @date 2026-08-29
     * @param title 推送标题
     * @param [desp=''] 推送内容
     * @param [option={}] 额外推送选项
     */
    async send(title: string, desp: string = '', option?: WebhookOption): Promise<SendResponse> {
        Debugger('title: "%s", desp: "%s", option: "%o"', title, desp, option)
        const headers = { ...this.WEBHOOK_HEADERS }
        const isPost = this.WEBHOOK_METHOD === 'POST'
        if (isPost && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
            headers['Content-Type'] = 'application/json; charset=utf-8'
        }
        // 模板渲染结果即最终请求体。必须用 Buffer 传给 axios：
        // string + application/json 会触发 axios 的 transformRequest 二次 JSON.stringify，
        // 导致用户模板被序列化成 JSON 字面量；Buffer 分支在 json 分支之前 return，原样透传。
        const data = isPost ? Buffer.from(this.renderTemplate(this.WEBHOOK_BODY_TEMPLATE, title, desp, option), 'utf-8') : undefined
        return ajax({
            url: this.WEBHOOK_URL,
            method: this.WEBHOOK_METHOD,
            headers,
            data,
        })
    }

}
