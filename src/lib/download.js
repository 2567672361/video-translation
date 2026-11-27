// 通过 fetch + Blob 下载，避免跨域时 <a download> 被浏览器忽略
export async function downloadFile(url, filename) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename || 'download'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
    return true
  } catch (error) {
    console.error('下载失败:', error)
    window.alert('下载失败，请稍后重试')
    return false
  }
}
