from django.urls import path

from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('editor/', views.editor, name='editor'),
    path('editor/save/', views.save_silhouette, name='save-silhouette'),
    path('editor/layer/', views.layer_editor, name='layer-editor'),
    path('editor/layer/save/', views.save_layer, name='save-layer'),
    path('ascii/', views.ascii_test, name='ascii-test'),
    path('accurate/', views.accurate_test, name='accurate-test'),
    path('background/', views.background, name='background'),
    path('background/img/<int:idx>/', views.background_image, name='background-image'),
]
