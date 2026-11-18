<script setup lang="ts">
// Shows a certificate PDF in a pop-up with a download button. The parent passes the blob URL.
import { onBeforeUnmount } from 'vue'
import { downloadBlobUrl } from '@/lib/certificatePdf'

const props = defineProps<{ url: string; filename: string; title?: string }>()
const emit = defineEmits<{ close: [] }>()

onBeforeUnmount(() => URL.revokeObjectURL(props.url))
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="card dialog">
      <div class="row" style="margin-bottom: 10px">
        <h3 style="margin: 0">{{ title ?? 'Certificate preview' }}</h3>
        <span class="sp" style="flex: 1" />
        <button class="btn btn-primary btn-sm" @click="downloadBlobUrl(url, filename)">⬇ Download PDF</button>
        <button class="btn btn-ghost btn-sm" @click="emit('close')">Close</button>
      </div>
      <iframe :src="url" title="Certificate PDF preview" />
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 16, 32, 0.6);
  z-index: 95;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 30px 14px;
  overflow: auto;
}
.dialog {
  width: 100%;
  max-width: 980px;
  padding: 18px;
}
iframe {
  width: 100%;
  aspect-ratio: 1.414;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
}
</style>
