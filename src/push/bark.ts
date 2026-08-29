import debug from 'debug'
import { Send } from '@/interfaces/send'
import { ajax } from '@/utils/ajax'
import { SendResponse } from '@/interfaces/response'
import { ConfigSchema, OptionSchema } from '@/interfaces/schema'
import { validate } from '@/utils/validate'

const Debugger = debug('push:bark')

export interface BarkConfig {
    /**
     * Bark 服务器地址。默认为 https://api.day.app，支持自建服务端，例如 https://bark.example.com
     */
    BARK_SERVER_URL?: string

    /**
     * 设备 Key。在 Bark App 中获取
     */
    BARK_DEVICE_KEY: string
}

export type BarkConfigSchema = ConfigSchema<BarkConfig>
export const barkConfigSchema: BarkConfigSchema = {
    BARK_SERVER_URL: {
        type: 'string',
        title: 'Bark 服务器地址',
        description: '默认为 https://api.day.app，支持自建服务端，例如 https://bark.example.com',
        required: false,
        default: 'https://api.day.app',
    },
    BARK_DEVICE_KEY: {
        type: 'string',
        title: '设备 Key',
        description: '在 Bark App 中获取',
        required: true,
        default: '',
    },
} as const

export interface BarkOption {
    /**
     * 点击通知跳转的 URL
     */
    url?: string

    /**
     * 通知分组。同一分组的通知可折叠
     */
    group?: string

    /**
     * 通知铃声。参考 https://github.com/Finb/bark-server/tree/master/deploy
     */
    sound?: string

    /**
     * 通知图标 URL
     */
    icon?: string

    /**
     * 通知级别。active=默认，timeSensitive=时效性，passive=被动，critical=重要
     */
    level?: string

    /**
     * 加密推送的密文（Bark 端到端加密）。传入后 body 将仅包含该密文，由 App 端解密
     */
    ciphertext?: string

    /**
     * 其他 Bark 支持的参数，原样透传给 bark-server
     */
    [key: string]: unknown
}

export type BarkOptionSchema = OptionSchema<BarkOption>
export const barkOptionSchema: BarkOptionSchema = {} as const

export interface BarkResponse {
    /**
     * 正确为 200
     */
    code: number
    /**
     * 正确为 success
     */
    message: string
    timestamp: number
}

/**
 * Bark 推送（iOS）。官方文档 https://bark.day.app/
 *
 * @author foolgry
 * @date 2026-08-29
 * @export
 * @class Bark
 */
export class Bark implements Send {

    static readonly namespace = 'Bark'
    static readonly configSchema = barkConfigSchema
    static readonly optionSchema = barkOptionSchema

    /**
     * Bark 服务器地址
     *
     * @author foolgry
     * @date 2026-08-29
     * @private
     */
    private BARK_SERVER_URL: string

    /**
     * 设备 Key
     *
     * @author foolgry
     * @date 2026-08-29
     * @private
     */
    private BARK_DEVICE_KEY: string

    /**
     * 创建 Bark 实例
     * @author foolgry
     * @date 2026-08-29
     * @param config 配置
     */
    constructor(config: BarkConfig) {
        const { BARK_SERVER_URL, BARK_DEVICE_KEY } = config
        this.BARK_SERVER_URL = BARK_SERVER_URL || 'https://api.day.app'
        this.BARK_DEVICE_KEY = BARK_DEVICE_KEY
        Debugger('set BARK_SERVER_URL: "%s", BARK_DEVICE_KEY: "%s"', BARK_SERVER_URL, BARK_DEVICE_KEY)
        // 根据 configSchema 验证 config
        validate(config, Bark.configSchema)
    }

    /**
     * @author foolgry
     * @date 2026-08-29
     * @param title 推送标题
     * @param [desp=''] 推送内容
     * @param [option={}] 额外推送选项
     */
    async send(title: string, desp: string = '', option?: BarkOption): Promise<SendResponse<BarkResponse>> {
        Debugger('title: "%s", desp: "%s", option: "%o"', title, desp, option)
        const data = {
            device_key: this.BARK_DEVICE_KEY,
            title,
            body: desp,
            ...option,
        }
        return ajax({
            baseURL: this.BARK_SERVER_URL,
            url: '/push',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
            data,
        })
    }

}
