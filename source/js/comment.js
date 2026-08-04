(function () {
  function fixWalineNick() {
    const input = document.querySelector('#wl-nick')
    const label = document.querySelector('label[for="wl-nick"]')
    const input1 = document.querySelector('#wl-mail')
    const label1 = document.querySelector('label[for="wl-mail"]')
    const textarea = document.querySelector('#wl-edit')
    
    if (input) {
      input.placeholder = 'QQ号可显示头像'
    }
    if (input1) {
      input1.placeholder = '可选'
    }

    if (label) {
      label.textContent = '昵称'
    }
    if (label1) {
      label1.textContent = '邮箱'
    }
    if (textarea) {
      textarea.placeholder='留下你独特的见解吧'
    }
    // 两个都处理到了，才算完成
    return !!(input && label && input1 && label1 && textarea)
  }

  const observer = new MutationObserver(() => {
    if (fixWalineNick()) {
      observer.disconnect()
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
})()