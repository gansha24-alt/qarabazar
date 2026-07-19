const en = {
  // Навигация
  'Каталог': 'Catalog',
  'Мастера': 'Artisans',
  'Мастера и бренды': 'Artisans & Brands',
  'О проекте': 'About Us',
  'Избранное': 'Favorites',
  'Корзина': 'Cart',
  'Войти / Регистрация': 'Login / Register',
  'Войти': 'Login',
  'Личный кабинет': 'My Account',
  'Найти изделие, мастера, материал…': 'Search for products, artisans, materials...',
  'Искать': 'Search',

  // Главная
  'Новые поступления': 'New Arrivals',
  'Выбор редакции': "Editor's Choice",
  'Наши мастера': 'Our Artisans',
  'Все мастера': 'All Artisans',
  'Категории': 'Categories',
  'Смотреть каталог': 'View Catalog',
  'маркетплейс локального творчества': 'marketplace for local creativity',
  'Керамика, текстиль, украшения и авторские вещи — напрямую от художников, ремесленников и локальных брендов.': 'Ceramics, textiles, jewelry, and handmade items — directly from artists, artisans, and local brands.',
  'мастеров и брендов': 'artisans and brands',
  'авторских изделий': 'authentic pieces',
  'городов на карте': 'cities on the map',
  'Манифест Qara Bazar': 'Qara Bazar Manifesto',
  'Только аутентичные авторы, создающие свои работы вручную.': 'Only authentic creators crafting their work by hand.',
  'Поддержка локальной экономики и устойчивого производства.': 'Supporting the local economy and sustainable production.',
  'Каждое изделие имеет свою уникальную историю и душу.': 'Every piece carries a unique story and soul.',
  'уникальных изделий': 'unique items',
  'городов': 'cities',

  // Каталог
  'Все категории': 'All Categories',
  'Фильтры': 'Filters',
  'Сначала новые': 'Newest first',
  'Сначала дешевые': 'Price: Low to High',
  'Сначала дорогие': 'Price: High to Low',
  'Цена, ₸': 'Price, KZT',
  'от': 'from',
  'до': 'to',
  'Применить': 'Apply',
  'Сбросить': 'Reset',
  'Ничего не найдено': 'Nothing found',
  'Попробуйте изменить параметры фильтра.': 'Try changing filter parameters.',

  // Товар
  'Об изделии': 'About the Item',
  'Материалы и техника': 'Materials & Technique',
  'Доставка': 'Delivery',
  'Продавец': 'Seller',
  'В корзину': 'Add to Cart',
  'В корзине': 'In Cart',
  'Оформить': 'Checkout',
  'Товар не найден': 'Product not found',
  'Отзывы': 'Reviews',
  'Написать отзыв': 'Write a review',
  
  // Корзина / Оформление
  'Ваша корзина пуста': 'Your cart is empty',
  'Перейти в каталог': 'Go to catalog',
  'Итого': 'Total',
  'Удалить': 'Remove',

  // Профиль / Авторизация
  'Логин': 'Username',
  'Пароль': 'Password',
  'Регистрация': 'Registration',
  'Зарегистрироваться': 'Register',
  'Выйти': 'Log Out',
  'Мои заказы': 'My Orders',
  'Настройки': 'Settings',

  // Подвал
  'Маркетплейс локального творчества': 'Marketplace for local creativity',
  'Покупателям': 'For Buyers',
  'Мастерам': 'For Artisans',
  'Контакты': 'Contacts',
  'Как купить': 'How to buy',
  'Доставка и оплата': 'Delivery & Payment',
  'Возврат': 'Returns',
  'Стать продавцом': 'Become a Seller',
  'Панель мастера': 'Seller Panel',
  'Правила площадки': 'Platform Rules'
};

function getTranslator(lang) {
  return function t(str) {
    if (lang === 'en' && en[str]) {
      return en[str];
    }
    return str; // Для 'ru' (или если перевода нет) возвращаем оригинал
  };
}

module.exports = { getTranslator, en };
