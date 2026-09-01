<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface TextTypeProps {
  text: string
  className?: string
  typingSpeed?: number
  initialDelay?: number
  showCursor?: boolean
  cursorCharacter?: string
  cursorBlinkDuration?: number
}

const props = withDefaults(defineProps<TextTypeProps>(), {
  className: '',
  typingSpeed: 72,
  initialDelay: 0,
  showCursor: true,
  cursorCharacter: '|',
  cursorBlinkDuration: 0.55,
})

const displayedText = ref('')
let typingTimer: ReturnType<typeof setTimeout> | undefined
let characterIndex = 0

function clearTypingTimer() {
  if (typingTimer)
    clearTimeout(typingTimer)
}

function finishTyping() {
  displayedText.value = props.text
  characterIndex = Array.from(props.text).length
}

function typeNextCharacter() {
  const characters = Array.from(props.text)
  if (characterIndex >= characters.length)
    return

  displayedText.value += characters[characterIndex]
  characterIndex += 1

  if (characterIndex < characters.length)
    typingTimer = setTimeout(typeNextCharacter, props.typingSpeed)
}

function startTyping() {
  clearTypingTimer()
  characterIndex = 0
  displayedText.value = ''

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finishTyping()
    return
  }

  typingTimer = setTimeout(typeNextCharacter, props.initialDelay)
}

onMounted(startTyping)

watch(() => props.text, startTyping)

onBeforeUnmount(clearTypingTimer)
</script>

<template>
  <span
    class="text-type"
    :class="props.className"
    :aria-label="props.text"
    role="text"
  >
    <span class="text-type__sizer" aria-hidden="true">{{ props.text }}</span>
    <span class="text-type__visual" aria-hidden="true">
      {{ displayedText }}<span
        v-if="props.showCursor"
        class="text-type__cursor"
        :style="{ animationDuration: `${props.cursorBlinkDuration}s` }"
      >{{ props.cursorCharacter }}</span>
    </span>
  </span>
</template>

<style scoped>
.text-type {
  position: relative;
  display: inline-block;
  white-space: pre;
  vertical-align: bottom;
}

.text-type__sizer {
  visibility: hidden;
}

.text-type__visual {
  position: absolute;
  inset: 0;
  white-space: pre;
}

.text-type__cursor {
  display: inline-block;
  margin-left: 0.08em;
  color: currentcolor;
  animation: text-type-cursor-blink ease-in-out infinite;
}

@keyframes text-type-cursor-blink {
  0%,
  45% {
    opacity: 1;
  }

  55%,
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .text-type__cursor {
    animation: none;
  }
}
</style>
