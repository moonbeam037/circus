function parseDate(givenDate) {
  let months = [ 'Января', 'Февраля','Марта','Апреля','Мая','Июня','Июля', 'Августа','Сентября', 'Октября', 'Ноября', 'Декабря'];
  let date = new Date(givenDate);
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
} 
$('#exitBtn').on('click', () => {
  $.ajax({
      type: "method",
      url: "/logOut",
      method: "POST",
      success: (res) => {
          this.location.href = "/login";
      }
  })
});