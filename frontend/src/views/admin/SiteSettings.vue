<script setup>
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { api } from '../../api'

const STORAGE_KEY = 'site-settings'

const message = useMessage()
const saving = ref(false)
const loading = ref(false)

const form = ref({
    title: '',
    copyright: '',
    intro: '',
    guide: '',
})

const load = async () => {
    loading.value = true
    try {
        const res = await api.fetch(`/admin/config/${STORAGE_KEY}`)
        if (res?.value) {
            Object.assign(form.value, JSON.parse(res.value))
        }
    } catch (error) {
        // first time there may be no saved value yet
        console.warn('load site settings failed', error)
    } finally {
        loading.value = false
    }
}

const save = async () => {
    saving.value = true
    try {
        await api.fetch('/admin/config', {
            method: 'POST',
            body: {
                key: STORAGE_KEY,
                value: JSON.stringify({
                    title: form.value.title.trim(),
                    copyright: form.value.copyright.trim(),
                    intro: form.value.intro.trim(),
                    guide: form.value.guide.trim(),
                }),
            },
        })
        message.success('保存成功，刷新页面后生效')
    } catch (error) {
        message.error(error.message || '保存失败')
    } finally {
        saving.value = false
    }
}

onMounted(load)
</script>

<template>
    <n-card :bordered="false" embedded title="站点设置">
        <n-spin :show="loading">
            <n-form label-placement="left" label-width="96px" style="max-width: 760px">
                <n-form-item label="站点标题">
                    <n-input v-model:value="form.title" placeholder="留空则使用 wrangler.toml 中的 TITLE" />
                </n-form-item>
                <n-form-item label="底部版权信息">
                    <n-input v-model:value="form.copyright"
                        placeholder="留空则使用 wrangler.toml 中的 COPYRIGHT，显示于首页底部" />
                </n-form-item>
                <n-form-item label="首页简介">
                    <n-input v-model:value="form.intro" type="textarea" :rows="3"
                        placeholder="留空则使用默认简介（显示于首页介绍卡片）" />
                </n-form-item>
                <n-form-item label="使用指南">
                    <n-input v-model:value="form.guide" type="textarea" :rows="6"
                        placeholder="每行一步，留空则使用默认四步指南（显示于首页指南卡片）" />
                </n-form-item>
                <n-form-item label=" ">
                    <n-space>
                        <n-button type="primary" :loading="saving" @click="save">保存</n-button>
                        <n-button secondary @click="load">重新加载</n-button>
                    </n-space>
                </n-form-item>
            </n-form>
        </n-spin>
        <n-alert type="info" :bordered="false" style="margin-top: 8px">
            保存后数据库中的值优先于 wrangler.toml 环境变量；留空则回退到环境变量。修改需刷新页面（浏览器/用户打开新页面）后生效。
        </n-alert>
    </n-card>
</template>
