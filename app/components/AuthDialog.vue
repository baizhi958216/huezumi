<script setup lang="ts">
import type { PublicUser } from '#shared/types/auth'

const open = defineModel<boolean>('open', { required: true })
const { registrationMode, refreshSession } = useAuth()
const mode = ref<'login' | 'register'>('login')
const slideDirection = ref<'slide-left' | 'slide-right'>('slide-left')
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const displayName = ref('')
const invitationCode = ref('')
const submitting = ref(false)
const errorMessage = ref('')

watch(open, (value) => {
  if (value) {
    errorMessage.value = ''
    showPassword.value = false
    slideDirection.value = 'slide-left'
  }
})

function switchMode(target: 'login' | 'register') {
  if (mode.value === target)
    return
  slideDirection.value = target === 'register' ? 'slide-left' : 'slide-right'
  mode.value = target
  errorMessage.value = ''
}

async function submit() {
  submitting.value = true
  errorMessage.value = ''
  try {
    const user = await $fetch<PublicUser>(mode.value === 'login' ? '/api/auth/login' : '/api/auth/register', {
      method: 'POST',
      body: mode.value === 'login'
        ? { email: email.value, password: password.value }
        : { email: email.value, password: password.value, displayName: displayName.value, invitationCode: invitationCode.value || undefined },
    })
    await refreshSession()
    if (user)
      open.value = false
  }
  catch (error: unknown) {
    const candidate = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    errorMessage.value = candidate.data?.statusMessage || candidate.statusMessage || candidate.message || '操作失败'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :scrollable="true"
    :title="mode === 'login' ? '登录 绘小宙' : '创建帐号'"
    description="登录后，生成任务、素材和作品会保存在你的私有空间。"
    :ui="{
      content: 'sm:max-w-[460px] w-full p-0 overflow-hidden border border-default/70 dark:border-white/10 rounded-2xl bg-elevated/95 backdrop-blur-2xl shadow-cinema divide-y-0',
    }"
  >
    <template #content="{ close }">
      <div class="relative overflow-hidden p-6 sm:p-7">
        <!-- 暖珊瑚色顶部光晕与高光边饰 -->
        <div class="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-44 w-72 rounded-full bg-signal-500/20 blur-3xl transition-opacity duration-500" />
        <div class="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-signal-500/60 to-transparent" />

        <!-- 顶栏：品牌标识与微动效关闭按钮 -->
        <div class="relative flex items-center justify-between">
          <div class="flex items-center gap-2">
            <BrandLogo compact class="size-6" />
            <span class="inline-flex items-center gap-1.5 rounded-full border border-signal-500/25 bg-signal-500/10 px-2.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-wider text-signal-600 dark:text-signal-400">
              <span class="size-1.5 rounded-full bg-signal-500 animate-pulse" />
              绘小宙 · 灵感小站
            </span>
          </div>

          <button
            type="button"
            class="group -mr-1 flex size-8 items-center justify-center rounded-lg text-muted transition-colors duration-200 hover:bg-muted hover:text-highlighted focus-ring cursor-pointer"
            aria-label="关闭"
            @click="close"
          >
            <UIcon
              name="i-lucide-x"
              class="size-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110 group-hover:rotate-90"
            />
          </button>
        </div>

        <!-- 标题与副标题（平滑交叉淡入淡出动效） -->
        <div class="relative mt-5 min-h-[50px]">
          <Transition
            mode="out-in"
            enter-active-class="transition-all duration-250 ease-out"
            enter-from-class="opacity-0 translate-y-1.5"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1.5"
          >
            <div :key="mode">
              <h2 class="type-card-title text-xl font-650 tracking-tight text-highlighted">
                {{ mode === 'login' ? '欢迎回到你的小宇宙' : '开启你的创作小宇宙' }}
              </h2>
              <p class="mt-1 text-xs leading-relaxed text-muted">
                {{ mode === 'login' ? '登录后，你的生成任务、素材和作品将同步至私有空间。' : '创建独立私有空间，畅享多模型视频生成与资产云端存储。' }}
              </p>
            </div>
          </Transition>
        </div>

        <!-- 分段式切换药丸标签（带平滑滑动滑块动效） -->
        <div
          v-if="registrationMode !== 'disabled'"
          class="relative mt-5 grid grid-cols-2 rounded-xl border border-default/70 bg-muted/60 p-1 dark:bg-muted/70 select-none"
        >
          <!-- 顺滑滑动的背景高光指示器 -->
          <div
            class="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-elevated shadow-sm border border-default/40 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
            :class="mode === 'login' ? 'left-1' : 'left-[calc(50%+2px)]'"
          />
          <button
            type="button"
            class="relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-550 transition-colors duration-200 cursor-pointer"
            :class="mode === 'login' ? 'text-highlighted' : 'text-muted hover:text-highlighted'"
            @click="switchMode('login')"
          >
            <UIcon name="i-lucide-log-in" class="size-3.5" />
            <span>账户登录</span>
          </button>
          <button
            type="button"
            class="relative z-10 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-550 transition-colors duration-200 cursor-pointer"
            :class="mode === 'register' ? 'text-highlighted' : 'text-muted hover:text-highlighted'"
            @click="switchMode('register')"
          >
            <UIcon name="i-lucide-user-plus" class="size-3.5" />
            <span>新用户注册</span>
          </button>
        </div>

        <!-- 表单主体（带方向感知的平滑滑动过渡面板） -->
        <form class="relative mt-5" @submit.prevent="submit">
          <!-- 为输入框的外扩 focus 光晕预留空间，避免被切换面板的裁切边界截断。 -->
          <div class="relative -m-1 overflow-hidden p-1">
            <Transition
              :name="slideDirection"
              mode="out-in"
            >
              <!-- 登录表单面板（登录邮箱与账户密码均参与位移与淡入淡出动画） -->
              <div v-if="mode === 'login'" key="login" class="space-y-3.5">
                <div class="animate-field-1">
                  <UFormField label="登录邮箱" required>
                    <UInput
                      v-model="email"
                      type="email"
                      icon="i-lucide-mail"
                      autocomplete="email"
                      class="auth-input w-full"
                      placeholder="name@example.com"
                      size="md"
                    />
                  </UFormField>
                </div>

                <div class="animate-field-2">
                  <UFormField label="账户密码" required>
                    <UInput
                      v-model="password"
                      :type="showPassword ? 'text' : 'password'"
                      icon="i-lucide-lock"
                      autocomplete="current-password"
                      class="auth-input w-full"
                      placeholder="••••••••••••"
                      size="md"
                    >
                      <template #trailing>
                        <button
                          type="button"
                          class="group flex size-7 items-center justify-center rounded text-muted transition hover:text-highlighted focus:outline-none cursor-pointer"
                          tabindex="-1"
                          :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                          @click="showPassword = !showPassword"
                        >
                          <UIcon
                            :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                            class="size-4 transition-transform duration-150 active:scale-90"
                          />
                        </button>
                      </template>
                    </UInput>
                  </UFormField>
                </div>
              </div>

              <!-- 注册表单面板（注册邮箱与设置密码与其它字段协同平滑滑入） -->
              <div v-else key="register" class="space-y-3.5">
                <div class="animate-field-1">
                  <UFormField label="创作者昵称" required>
                    <UInput
                      v-model="displayName"
                      icon="i-lucide-user"
                      autocomplete="name"
                      class="auth-input w-full"
                      placeholder="例如：Neo Director"
                      size="md"
                    />
                  </UFormField>
                </div>

                <div class="animate-field-2">
                  <UFormField label="注册邮箱" required>
                    <UInput
                      v-model="email"
                      type="email"
                      icon="i-lucide-mail"
                      autocomplete="email"
                      class="auth-input w-full"
                      placeholder="name@example.com"
                      size="md"
                    />
                  </UFormField>
                </div>

                <div class="animate-field-3">
                  <UFormField label="设置密码" hint="至少 10 个字符" required>
                    <UInput
                      v-model="password"
                      :type="showPassword ? 'text' : 'password'"
                      icon="i-lucide-lock"
                      autocomplete="new-password"
                      class="auth-input w-full"
                      placeholder="••••••••••••"
                      size="md"
                    >
                      <template #trailing>
                        <button
                          type="button"
                          class="group flex size-7 items-center justify-center rounded text-muted transition hover:text-highlighted focus:outline-none cursor-pointer"
                          tabindex="-1"
                          :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                          @click="showPassword = !showPassword"
                        >
                          <UIcon
                            :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                            class="size-4 transition-transform duration-150 active:scale-90"
                          />
                        </button>
                      </template>
                    </UInput>
                  </UFormField>
                </div>

                <div v-if="registrationMode === 'invite'" class="animate-field-4">
                  <UFormField label="内测邀请码" hint="凭有效邀请码激活权限" required>
                    <UInput
                      v-model="invitationCode"
                      icon="i-lucide-ticket"
                      autocomplete="one-time-code"
                      class="auth-input w-full"
                      placeholder="输入您的专属邀请码"
                      size="md"
                    />
                  </UFormField>
                </div>
              </div>
            </Transition>
          </div>

          <!-- 错误提示过渡 -->
          <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div v-if="errorMessage" class="mt-3">
              <UAlert
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                :description="errorMessage"
                class="py-2.5 text-xs"
              />
            </div>
          </Transition>

          <!-- 操作主按钮（带文字图标顺滑交替动效） -->
          <UButton
            type="submit"
            block
            size="lg"
            color="primary"
            :loading="submitting"
            class="group relative mt-4 overflow-hidden shadow-glow cursor-pointer"
          >
            <Transition
              mode="out-in"
              enter-active-class="transition-all duration-200 ease-out"
              enter-from-class="opacity-0 scale-95"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition-all duration-120 ease-in"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-95"
            >
              <span :key="mode" class="inline-flex items-center justify-center gap-2">
                <span class="font-600">{{ mode === 'login' ? '立即登录工作台' : '创建帐号并开启创作' }}</span>
                <UIcon
                  :name="mode === 'login' ? 'i-lucide-arrow-right' : 'i-lucide-sparkles'"
                  class="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
            </Transition>
          </UButton>

          <!-- 底部切换与安全提示 -->
          <div class="pt-3">
            <div v-if="registrationMode !== 'disabled'" class="flex items-center justify-between text-xs text-muted">
              <button
                type="button"
                class="transition hover:text-highlighted focus-ring cursor-pointer"
                @click="switchMode(mode === 'login' ? 'register' : 'login')"
              >
                {{ mode === 'login' ? '还没有帐号？立即免费创建' : '已有帐号？直接登录' }}
              </button>
              <span class="inline-flex items-center gap-1 text-[11px] text-dimmed">
                <UIcon name="i-lucide-shield-check" class="size-3.5 text-signal-500/70" />
                安全会话保护
              </span>
            </div>
            <p v-else class="text-center text-xs text-muted">
              当前暂未开放公开注册，如有需求请联系管理员
            </p>
          </div>
        </form>

        <!-- 底部特色优势徽标栏 -->
        <div class="relative mt-6 border-t border-default/50 pt-4">
          <div class="flex items-center justify-center gap-3 text-[11px] text-dimmed">
            <span class="inline-flex items-center gap-1">
              <UIcon name="i-lucide-zap" class="size-3 text-signal-500" />
              多模型即时排队
            </span>
            <span class="text-default/50">·</span>
            <span class="inline-flex items-center gap-1">
              <UIcon name="i-lucide-cloud" class="size-3 text-signal-500" />
              云端资产持久化
            </span>
            <span class="text-default/50">·</span>
            <span class="inline-flex items-center gap-1">
              <UIcon name="i-lucide-film" class="size-3 text-signal-500" />
              创作成果随时回看
            </span>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
/* 向左平滑滑入（登录 -> 注册） */
.slide-left-enter-active {
  transition: all 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-left-leave-active {
  transition: all 140ms cubic-bezier(0.4, 0, 1, 1);
}
.slide-left-enter-from {
  opacity: 0;
  transform: translateX(18px);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}

/* 向右平滑滑入（注册 -> 登录） */
.slide-right-enter-active {
  transition: all 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-right-leave-active {
  transition: all 140ms cubic-bezier(0.4, 0, 1, 1);
}
.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-18px);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(18px);
}

/* 弹窗打开时各字段的微升浪涌动效 */
@keyframes form-field-rise {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-field-1 {
  animation: form-field-rise 280ms cubic-bezier(0.16, 1, 0.3, 1) 40ms both;
}
.animate-field-2 {
  animation: form-field-rise 280ms cubic-bezier(0.16, 1, 0.3, 1) 90ms both;
}
.animate-field-3 {
  animation: form-field-rise 280ms cubic-bezier(0.16, 1, 0.3, 1) 140ms both;
}
.animate-field-4 {
  animation: form-field-rise 280ms cubic-bezier(0.16, 1, 0.3, 1) 190ms both;
}

/* 输入框焦点朱红微光泽过渡 */
:deep(.auth-input input) {
  transition:
    border-color 200ms ease,
    box-shadow 200ms ease,
    background-color 200ms ease;
}

:deep(.auth-input input:focus) {
  border-color: rgba(255, 77, 53, 0.6) !important;
  box-shadow: 0 0 0 3px rgba(255, 77, 53, 0.15) !important;
}
</style>
