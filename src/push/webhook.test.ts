import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/utils/ajax', () => ({
    ajax: vi.fn(),
}))

import { Webhook } from './webhook'
import { ajax } from '@/utils/ajax'

const mockedAjax = vi.mocked(ajax)

describe('Webhook', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockedAjax.mockResolvedValue({ data: 'ok', status: 200, statusText: 'OK', headers: {}, config: {} } as any)
    })

    it('should validate config', () => {
        expect(() => new Webhook({ WEBHOOK_URL: '' })).toThrow('"WEBHOOK_URL" 字段是必须的！')
    })

    it('should post rendered body by default', async () => {
        const webhook = new Webhook({ WEBHOOK_URL: 'https://example.com/hook' })
        const result = await webhook.send('标题', '内容')
        expect(result.data).toBe('ok')
        const [config] = mockedAjax.mock.calls[0]
        expect(config.url).toBe('https://example.com/hook')
        expect(config.method).toBe('POST')
        expect(config.headers).toEqual({
            'Content-Type': 'text/plain; charset=utf-8',
        })
        // Buffer 透传给 axios，避免 string + application/json 被二次 JSON.stringify
        expect(Buffer.isBuffer(config.data)).toBe(true)
        expect((config.data as Buffer).toString('utf-8')).toBe('标题\n内容')
    })

    it('should replace all placeholders and keep custom headers', async () => {
        const webhook = new Webhook({
            WEBHOOK_URL: 'https://example.com/hook',
            WEBHOOK_METHOD: 'POST',
            WEBHOOK_HEADERS: '{"Authorization": "Bearer xxx"}',
            WEBHOOK_BODY_TEMPLATE: '{"msg": "{{title}}|{{body}}|{{url}}|{{task}}"}',
        })
        await webhook.send('标题', '内容', { url: 'https://example.com/t/1', task: '换滤芯' })
        const [config] = mockedAjax.mock.calls[0]
        expect(config.headers).toEqual({
            Authorization: 'Bearer xxx',
            'Content-Type': 'text/plain; charset=utf-8',
        })
        expect((config.data as Buffer).toString('utf-8')).toBe('{"msg": "标题|内容|https://example.com/t/1|换滤芯"}')
    })

    it('should not override provided content-type', async () => {
        const webhook = new Webhook({
            WEBHOOK_URL: 'https://example.com/hook',
            WEBHOOK_HEADERS: '{"Content-Type": "text/plain"}',
        })
        await webhook.send('标题', '内容')
        const [config] = mockedAjax.mock.calls[0]
        expect(config.headers).toEqual({ 'Content-Type': 'text/plain' })
    })

    it('should omit body for GET and ignore invalid headers', async () => {
        const webhook = new Webhook({
            WEBHOOK_URL: 'https://example.com/hook',
            WEBHOOK_METHOD: 'GET',
            WEBHOOK_HEADERS: 'not-a-json',
            WEBHOOK_BODY_TEMPLATE: '{{title}}',
        })
        await webhook.send('标题', '内容')
        const [config] = mockedAjax.mock.calls[0]
        expect(config.method).toBe('GET')
        expect(config.headers).toEqual({})
        // GET 必须显式传 null：undefined 会被公共 ajax 解构默认为 {}，经 axios 变成 body "{}"
        expect(config.data).toBeNull()
    })

    it('should render missing url/task placeholders as empty string', async () => {
        const webhook = new Webhook({
            WEBHOOK_URL: 'https://example.com/hook',
            WEBHOOK_BODY_TEMPLATE: '{{title}} {{url}} {{task}}',
        })
        await webhook.send('标题', '内容')
        const [config] = mockedAjax.mock.calls[0]
        expect((config.data as Buffer).toString('utf-8')).toBe('标题  ')
    })

    it('should keep dollar sequences in values as-is when rendering', async () => {
        // 字符串形式的替换串会把 $&、$`、$' 等当作特殊序列展开，函数形式替换必须原样保留
        const webhook = new Webhook({
            WEBHOOK_URL: 'https://example.com/hook',
            WEBHOOK_BODY_TEMPLATE: '{{title}}|{{body}}|{{url}}|{{task}}',
        })
        const title = '$& $` $\''
        const body = 'body$&'
        const url = 'https://example.com/$&'
        const task = 'task$\''
        await webhook.send(title, body, { url, task })
        const [config] = mockedAjax.mock.calls[0]
        expect((config.data as Buffer).toString('utf-8')).toBe(`${title}|${body}|${url}|${task}`)
    })

    it('should fall back to empty headers for non-object JSON without throwing', async () => {
        for (const raw of ['null', '[]', '"x"']) {
            const webhook = new Webhook({
                WEBHOOK_URL: 'https://example.com/hook',
                WEBHOOK_HEADERS: raw,
            })
            await expect(webhook.send('标题', '内容')).resolves.toBeDefined()
            const config = mockedAjax.mock.calls.at(-1)![0]
            // 非对象 JSON 回落为 {}，仅保留默认 Content-Type，不抛错也不带任何解析出的请求头
            expect(config.headers).toEqual({ 'Content-Type': 'text/plain; charset=utf-8' })
        }
    })
})
